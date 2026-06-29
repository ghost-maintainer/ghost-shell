-- Ghost Shell Supabase Database Schema
-- Run this schema in your Supabase SQL Editor to set up all tables and security policies.

-- 1. USER PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    salt text NOT NULL,
    password_verification text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. USER HOSTS TABLE
CREATE TABLE IF NOT EXISTS public.user_hosts (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    host_id text NOT NULL,
    encrypted_data text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT user_hosts_pkey PRIMARY KEY (user_id, host_id)
);

-- 3. USER KEYS TABLE
CREATE TABLE IF NOT EXISTS public.user_keys (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_id text NOT NULL,
    encrypted_data text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT user_keys_pkey PRIMARY KEY (user_id, key_id)
);

-- 4. USER LOGS TABLE (New)
CREATE TABLE IF NOT EXISTS public.user_logs (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id text NOT NULL,
    encrypted_data text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT user_logs_pkey PRIMARY KEY (user_id, session_id)
);

-- ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_logs ENABLE ROW LEVEL SECURITY;

-- CREATE SECURITY POLICIES FOR USER-SPECIFIC READ/WRITE ACCESS
-- User Profiles Policies
CREATE POLICY "Allow individual read/write access to profiles" ON public.user_profiles
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User Hosts Policies
CREATE POLICY "Allow individual read/write access to hosts" ON public.user_hosts
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User Keys Policies
CREATE POLICY "Allow individual read/write access to keys" ON public.user_keys
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User Logs Policies
CREATE POLICY "Allow individual read/write access to logs" ON public.user_logs
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
