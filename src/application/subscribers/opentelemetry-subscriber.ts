import { trace, context, Span, Tracer, SpanStatusCode } from '@opentelemetry/api';
import type { EventSubscriber } from '../../domain/event-bus.js';
import type { AgentEvent, AgentEventType } from '../../domain/types.js';

export class OpenTelemetrySubscriber implements EventSubscriber {
  name = 'OpenTelemetrySubscriber';
  subscribedEvents: AgentEventType[] = [
    'message:user',
    'message:assistant',
    'turn:trace',
    'tool:call',
    'tool:result',
    'badcase:detected',
    'user:feedback'
  ];

  private tracer: Tracer;
  // Manage active spans for a given session
  private activeSpans = new Map<string, { root: Span; currentTurn?: Span }>();

  constructor() {
    this.tracer = trace.getTracer('ecom-agent-core');
  }

  handle(event: AgentEvent): void {
    const sessionId = event.sessionId || 'unknown';

    if (!this.activeSpans.has(sessionId)) {
      // Create a root span for the session if it doesn't exist
      const rootSpan = this.tracer.startSpan(`Session: ${sessionId}`);
      rootSpan.setAttribute('session.id', sessionId);
      this.activeSpans.set(sessionId, { root: rootSpan });
    }

    const sessionSpans = this.activeSpans.get(sessionId)!;

    switch (event.type) {
      case 'message:user': {
        // Start a new turn span
        if (sessionSpans.currentTurn) {
          sessionSpans.currentTurn.end();
        }
        
        const turnSpan = this.tracer.startSpan('Agent Turn', undefined, trace.setSpan(context.active(), sessionSpans.root));
        turnSpan.setAttribute('user.message', String(event.payload.content || ''));
        sessionSpans.currentTurn = turnSpan;
        break;
      }
      
      case 'message:assistant': {
        const turnSpan = sessionSpans.currentTurn || sessionSpans.root;
        turnSpan.addEvent('assistant_reply', {
          content: String(event.payload.content || '')
        });
        break;
      }

      case 'turn:trace': {
        const turnSpan = sessionSpans.currentTurn;
        if (turnSpan) {
          const payload = event.payload as any;
          turnSpan.setAttribute('agent.intent', payload.intent || 'unknown');
          turnSpan.setAttribute('agent.latencyMs', payload.latencyMs || 0);
          
          if (payload.profile) {
            turnSpan.setAttribute('profile.completeness', payload.profile.completeness || 0);
            turnSpan.setAttribute('profile.coldStartStage', payload.profile.coldStartStage || 'unknown');
          }
          
          if (payload.preferenceSignal) {
            turnSpan.setAttribute('signal.type', payload.preferenceSignal.type || 'none');
            turnSpan.setAttribute('signal.confidence', payload.preferenceSignal.confidence || 0);
          }

          if (payload.recommendation) {
            turnSpan.setAttribute('recommendation.confidence', payload.recommendation.confidence || 0);
            turnSpan.setAttribute('recommendation.spec', payload.recommendation.propValueId || '');
          }
          
          turnSpan.end();
          sessionSpans.currentTurn = undefined;
        }
        break;
      }

      case 'tool:call': {
        const parentSpan = sessionSpans.currentTurn || sessionSpans.root;
        const toolSpan = this.tracer.startSpan(`Tool: ${event.payload.tool}`, undefined, trace.setSpan(context.active(), parentSpan));
        toolSpan.setAttribute('tool.args', JSON.stringify(event.payload.args));
        // We temporarily store the tool span to end it in tool:result
        (sessionSpans as any)[`tool_${event.payload.tool}`] = toolSpan;
        break;
      }

      case 'tool:result': {
        const toolSpan = (sessionSpans as any)[`tool_${event.payload.tool}`] as Span;
        if (toolSpan) {
          toolSpan.setAttribute('tool.result', String(event.payload.resultPreview || ''));
          toolSpan.end();
          delete (sessionSpans as any)[`tool_${event.payload.tool}`];
        }
        break;
      }

      case 'badcase:detected': {
        const parentSpan = sessionSpans.currentTurn || sessionSpans.root;
        parentSpan.addEvent('badcase_detected', {
          badcaseId: String(event.payload.badcaseId)
        });
        parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Badcase detected' });
        break;
      }

      case 'user:feedback': {
        const parentSpan = sessionSpans.currentTurn || sessionSpans.root;
        parentSpan.addEvent('user_feedback', {
          feedbackType: String(event.payload.feedback) // e.g., 'like' or 'dislike'
        });
        break;
      }
    }
  }

  // Allow manual ending of a session span, though in stateless HTTP it might just run indefinitely 
  // or be garbage collected if we implement a timeout mechanism.
  endSession(sessionId: string): void {
    const sessionSpans = this.activeSpans.get(sessionId);
    if (sessionSpans) {
      if (sessionSpans.currentTurn) sessionSpans.currentTurn.end();
      sessionSpans.root.end();
      this.activeSpans.delete(sessionId);
    }
  }
}
