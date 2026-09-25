// Replace with your own project's URL and anon (public) key.
// Find these in Supabase Dashboard -> Project Settings -> API.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://gaikuenmrtudqqdlwwdb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhaWt1ZW5tcnR1ZHFxZGx3d2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNjE4NzksImV4cCI6MjEwNTkzNzg3OX0.P_bA2O5i2f57G9VWHUdkdwBoQuUytU1b0NmA9SIvtS4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
