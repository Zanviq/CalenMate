import { google } from 'googleapis';
import { supabaseAdmin } from './supabase';

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

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
    throw new Error('Google 계정이 연결되지 않았습니다. 다시 로그인해주세요.');
  }

  const oauth2Client = createOAuth2Client();

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

  // If we have a refresh token, proactively refresh if token is likely expired
  if (profile.google_refresh_token) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    } catch {
      // Refresh failed — will try with existing token
    }
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  return { calendar, oauth2Client };
}
