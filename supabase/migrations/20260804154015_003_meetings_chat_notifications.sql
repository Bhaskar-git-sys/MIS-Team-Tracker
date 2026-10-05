/*
# Meetings, Meeting Signals, Meeting Participants, Chat, Messages, Notifications, Files, Presence
*/

-- ============ MEETINGS ============
CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  title text NOT NULL DEFAULT 'Team Meeting',
  started_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
CREATE POLICY "meetings_insert" ON public.meetings
  FOR INSERT TO authenticated WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
CREATE POLICY "meetings_update" ON public.meetings
  FOR UPDATE TO authenticated USING (public.is_manager()) WITH CHECK (true);

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;
CREATE POLICY "meetings_delete" ON public.meetings
  FOR DELETE TO authenticated USING (public.is_manager());

-- ============ MEETING SIGNALS ============
CREATE TABLE IF NOT EXISTS public.meeting_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate', 'join', 'leave', 'hand-raise', 'hand-lower')),
  signal_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.meeting_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting_signals_select" ON public.meeting_signals;
CREATE POLICY "meeting_signals_select" ON public.meeting_signals
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "meeting_signals_insert" ON public.meeting_signals;
CREATE POLICY "meeting_signals_insert" ON public.meeting_signals
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "meeting_signals_delete" ON public.meeting_signals;
CREATE POLICY "meeting_signals_delete" ON public.meeting_signals
  FOR DELETE TO authenticated USING (auth.uid() = sender_id OR public.is_manager());

-- ============ MEETING PARTICIPANTS ============
CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  left_at timestamptz,
  hand_raised boolean DEFAULT false,
  is_muted boolean DEFAULT false,
  is_video_on boolean DEFAULT true,
  UNIQUE(meeting_id, user_id)
);

ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting_participants_select" ON public.meeting_participants;
CREATE POLICY "meeting_participants_select" ON public.meeting_participants
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "meeting_participants_insert" ON public.meeting_participants;
CREATE POLICY "meeting_participants_insert" ON public.meeting_participants
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "meeting_participants_update" ON public.meeting_participants;
CREATE POLICY "meeting_participants_update" ON public.meeting_participants
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "meeting_participants_delete" ON public.meeting_participants;
CREATE POLICY "meeting_participants_delete" ON public.meeting_participants
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_manager());

-- ============ CHAT GROUPS ============
CREATE TABLE IF NOT EXISTS public.chat_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_general boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_groups_select" ON public.chat_groups;
CREATE POLICY "chat_groups_select" ON public.chat_groups
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "chat_groups_insert" ON public.chat_groups;
CREATE POLICY "chat_groups_insert" ON public.chat_groups
  FOR INSERT TO authenticated WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "chat_groups_update" ON public.chat_groups;
CREATE POLICY "chat_groups_update" ON public.chat_groups
  FOR UPDATE TO authenticated USING (public.is_manager()) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_groups_delete" ON public.chat_groups;
CREATE POLICY "chat_groups_delete" ON public.chat_groups
  FOR DELETE TO authenticated USING (public.is_manager());

-- ============ CHAT GROUP MEMBERS ============
CREATE TABLE IF NOT EXISTS public.chat_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_group_members_select" ON public.chat_group_members;
CREATE POLICY "chat_group_members_select" ON public.chat_group_members
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "chat_group_members_insert" ON public.chat_group_members;
CREATE POLICY "chat_group_members_insert" ON public.chat_group_members
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "chat_group_members_delete" ON public.chat_group_members;
CREATE POLICY "chat_group_members_delete" ON public.chat_group_members
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_manager());

-- ============ MESSAGES ============
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  content text,
  file_url text,
  file_name text,
  file_type text,
  file_size bigint,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CHECK (receiver_id IS NOT NULL OR group_id IS NOT NULL)
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT TO authenticated
  USING (
    auth.uid() = sender_id OR
    auth.uid() = receiver_id OR
    (group_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.chat_group_members cgm
      WHERE cgm.group_id = messages.group_id AND cgm.user_id = auth.uid()
    )) OR
    public.is_manager()
  );

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "messages_update" ON public.messages;
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id OR auth.uid() = sender_id)
  WITH CHECK (true);

DROP POLICY IF EXISTS "messages_delete" ON public.messages;
CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE TO authenticated USING (auth.uid() = sender_id OR public.is_manager());

-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  type text DEFAULT 'info' CHECK (type IN ('info', 'task', 'leave', 'meeting', 'chat', 'system')),
  is_read boolean DEFAULT false,
  link text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_manager());

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_manager())
  WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_manager());

-- ============ FILES ============
CREATE TABLE IF NOT EXISTS public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  category text DEFAULT 'general',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "files_select" ON public.files;
CREATE POLICY "files_select" ON public.files
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_manager());

DROP POLICY IF EXISTS "files_insert" ON public.files;
CREATE POLICY "files_insert" ON public.files
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_manager());

DROP POLICY IF EXISTS "files_delete" ON public.files;
CREATE POLICY "files_delete" ON public.files
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_manager());

-- ============ PRESENCE ============
CREATE TABLE IF NOT EXISTS public.presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'break', 'lunch', 'meeting', 'offline')),
  last_seen timestamptz DEFAULT now(),
  current_task text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presence_select" ON public.presence;
CREATE POLICY "presence_select" ON public.presence
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "presence_insert" ON public.presence;
CREATE POLICY "presence_insert" ON public.presence
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "presence_update" ON public.presence;
CREATE POLICY "presence_update" ON public.presence
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "presence_delete" ON public.presence;
CREATE POLICY "presence_delete" ON public.presence
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_manager());

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_group ON public.messages(group_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_meeting_signals_room ON public.meeting_signals(room_id, created_at);

-- Enable realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
