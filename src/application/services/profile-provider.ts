import type { UserProfileEntity } from '../../domain/entities/user-profile.entity.js';

export interface ProfileProvider {
  /**
   * Fetch the user profile from the external Profile Extraction System.
   * Return null if the user is completely new or has no profile.
   */
  getProfile(userId: string): Promise<UserProfileEntity | null>;
}
