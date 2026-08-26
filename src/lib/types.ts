export type UserRole = "admin" | "narrator";

export type NarrationMode = "synchronized" | "dictation";

export type NarrationStatus = "draft" | "submitted";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  created_at: string;
}

export interface Video {
  id: string;
  title: string;
  procedure_type: string;
  description: string | null;
  case_id: string | null;
  video_storage_path: string;
  duration: number | null;
  uploaded_by: string;
  created_at: string;
}

export type DriveSyncStatus =
  | "not_required"
  | "pending"
  | "synced"
  | "failed";

export interface Narration {
  id: string;
  video_id: string;
  user_id: string;
  narration_mode: NarrationMode;
  audio_storage_path: string | null;
  recording_duration: number | null;
  video_start_timestamp: number;
  notes: string | null;
  next_step: string | null;
  status: NarrationStatus;
  drive_sync_status?: DriveSyncStatus | null;
  drive_audio_file_id?: string | null;
  drive_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoWithStats extends Video {
  narration_count: number;
  /** Aggregate status for the current user, or overall: not_started | draft | submitted */
  narration_status: "not_started" | NarrationStatus;
  uploader_name?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
}

export interface VideoAssignment {
  id: string;
  video_id: string;
  user_id: string;
  invited_by: string;
  created_at: string;
}

export interface Invite {
  id: string;
  email: string;
  display_name: string | null;
  token: string;
  invited_by: string;
  accepted_at: string | null;
  user_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface InviteWithVideos extends Invite {
  video_ids: string[];
  video_titles: string[];
  invited_by_name?: string;
}

export interface InvitePublic {
  id: string;
  email: string;
  display_name: string | null;
  invited_by: string;
  accepted_at: string | null;
  user_id: string | null;
  expires_at: string;
  created_at: string;
  video_ids: string[];
  video_titles: string[];
  invited_by_name?: string;
}

/** Strip invite bearer token before sending invites to the browser. */
export function toPublicInvite(invite: InviteWithVideos): InvitePublic {
  // Omit bearer token — never send invite secrets to the browser list UI.
  return {
    id: invite.id,
    email: invite.email,
    display_name: invite.display_name,
    invited_by: invite.invited_by,
    accepted_at: invite.accepted_at,
    user_id: invite.user_id,
    expires_at: invite.expires_at,
    created_at: invite.created_at,
    video_ids: invite.video_ids,
    video_titles: invite.video_titles,
    invited_by_name: invite.invited_by_name,
  };
}
