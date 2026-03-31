import { google } from 'googleapis';
import { supabaseAdmin } from './supabase';

export async function getCalendarClient(userId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('google_access_token, google_refresh_token')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw new Error('User profile not found');
  }

  if (!profile.google_access_token) {
    throw new Error('Google account not connected');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: profile.google_access_token,
    refresh_token: profile.google_refresh_token,
  });

  // Save refreshed tokens back to DB
  oauth2Client.on('tokens', async (tokens) => {
    const update: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };
    if (tokens.access_token) {
      update.google_access_token = tokens.access_token;
    }
    if (tokens.refresh_token) {
      update.google_refresh_token = tokens.refresh_token;
    }
    await supabaseAdmin
      .from('profiles')
      .update(update)
      .eq('id', userId);
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  return { calendar, oauth2Client };
}
