import type { FastifyInstance } from 'fastify';
import type { ProfileStore } from '../../application/services/profile-store.js';
import type { ProfileProvider } from '../../application/services/profile-provider.js';

export function registerProfileRoutes(app: FastifyInstance, profileStore: ProfileStore, profileProvider: ProfileProvider) {
  app.get<{ Params: { userId: string } }>('/api/profile/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    
    let profile = await profileStore.load(userId);
    if (!profile) {
      profile = await profileProvider.getProfile(userId);
      if (profile) {
        await profileStore.save(profile);
      }
    }

    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }
    return reply.send(profile.toJSON());
  });
}
