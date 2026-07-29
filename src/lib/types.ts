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
