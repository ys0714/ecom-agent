import type { FastifyInstance } from 'fastify';
import type { ProfileStore } from '../../application/services/profile-store.js';

export function registerProfileRoutes(app: FastifyInstance, profileStore: ProfileStore) {
  app.get<{ Params: { userId: string } }>('/api/profile/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const profile = await profileStore.load(userId);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }
    return reply.send(profile.toJSON());
  });
}
