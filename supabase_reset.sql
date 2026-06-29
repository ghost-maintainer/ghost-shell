-- Ghost Shell Supabase Database Reset Script
-- WARNING: Running this script in your Supabase SQL Editor will delete ALL data (synced hosts, keys, and profiles) for all users!

-- 1. CLEAN UP ALL EXISTING TABLES (CASCADE cleanly drops all foreign key relations)
DROP TABLE IF EXISTS public.user_keys CASCADE;
DROP TABLE IF EXISTS public.user_hosts CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;

-- 2. CREATE USER PROFILES TABLE
CREATE TABLE public.user_profiles (
    user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    salt text NOT NULL,
    password_verification text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. CREATE USER HOSTS TABLE
CREATE TABLE public.user_hosts (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    host_id text NOT NULL,
    encrypted_data text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT user_hosts_pkey PRIMARY KEY (user_id, host_id)
);

-- 4. CREATE USER KEYS TABLE
CREATE TABLE public.user_keys (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_id text NOT NULL,
    encrypted_data text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT user_keys_pkey PRIMARY KEY (user_id, key_id)
);

-- 6. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;

-- 7. DEFINE ROW LEVEL SECURITY (RLS) POLICIES FOR USER SEPARATION
-- User Profiles Policies
CREATE POLICY "Allow individual read/write access to profiles" ON public.user_profiles
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User Hosts Policies
CREATE POLICY "Allow individual read/write access to hosts" ON public.user_hosts
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User Keys Policies
CREATE POLICY "Allow individual read/write access to keys" ON public.user_keys
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
