import { google, calendar_v3 } from 'googleapis';
import { getOAuth2Client, invalidateAuthCache } from './google-auth';

export const invalidateCalendarCache = invalidateAuthCache;

export async function getCalendarClient(userId: string) {
  const oauth2Client = await getOAuth2Client(userId);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  return { calendar, oauth2Client };
}
