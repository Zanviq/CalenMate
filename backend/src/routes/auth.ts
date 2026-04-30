import { Router, Response } from 'express';
import { google } from 'googleapis';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';
import { getOAuth2Client, isInvalidGrantError } from '../services/google-auth';

const router = Router();

router.use(authMiddleware);

type ConnectionState =
  | { connected: true }
  | { connected: false; reason: 'not_linked' | 'invalid_grant' | 'forbidden' | 'unknown'; message: string };

// GET /connection-status - Probe Google Calendar + Tasks API reachability for the user
router.get('/connection-status', async (req: AuthRequest, res: Response) => {
  try {
    let oauth2Client;
    try {
      oauth2Client = await getOAuth2Client(req.userId!);
    } catch {
      const notLinked: ConnectionState = {
        connected: false,
        reason: 'not_linked',
        message: 'Google 계정이 연결되지 않았습니다.',
      };
      res.json({ googleLinked: false, calendar: notLinked, tasks: notLinked });
      return;
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const tasks = google.tasks({ version: 'v1', auth: oauth2Client });

    const probe = async (op: () => Promise<unknown>): Promise<ConnectionState> => {
      try {
        await op();
        return { connected: true };
      } catch (err: unknown) {
        if (isInvalidGrantError(err)) {
          return {
            connected: false,
            reason: 'invalid_grant',
            message: 'Google 인증이 만료되었습니다. 다시 로그인해주세요.',
          };
        }
        const e = err as { code?: number | string; message?: string };
        const code = typeof e.code === 'number' ? e.code : Number(e.code);
        if (code === 401 || code === 403) {
          return {
            connected: false,
            reason: 'forbidden',
            message: '권한이 부족합니다. 다시 로그인하여 권한을 부여해주세요.',
          };
        }
        return {
          connected: false,
          reason: 'unknown',
          message: e.message || '연결 확인 중 오류가 발생했습니다.',
        };
      }
    };

    const [calendarStatus, tasksStatus] = await Promise.all([
      probe(() => calendar.calendarList.list({ maxResults: 1 })),
      probe(() => tasks.tasklists.list({ maxResults: 1 })),
    ]);

    res.json({
      googleLinked: true,
      calendar: calendarStatus,
      tasks: tasksStatus,
    });
  } catch (err) {
    console.error('connection-status failed:', err);
    res.status(500).json({ error: 'Failed to check connection status' });
  }
});

// GET /me - Get current user profile
router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.userId)
      .single();

    if (error || !profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json(profile);
  } catch {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// POST /google - Save Google tokens
router.post('/google', async (req: AuthRequest, res: Response) => {
  try {
    const { access_token, refresh_token } = req.body;

    if (!access_token) {
      res.status(400).json({ error: 'access_token is required' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        google_access_token: access_token,
        google_refresh_token: refresh_token || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.userId);

    if (error) {
      res.status(500).json({ error: 'Failed to save tokens' });
      return;
    }

    res.json({ message: 'Google tokens saved successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to save Google tokens' });
  }
});

// POST /refresh - Refresh Google access token
router.post('/refresh', async (req: AuthRequest, res: Response) => {
  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('google_refresh_token')
      .eq('id', req.userId)
      .single();

    if (profileError || !profile?.google_refresh_token) {
      res.status(400).json({ error: 'No refresh token available' });
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: profile.google_refresh_token,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        google_access_token: credentials.access_token,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.userId);

    if (updateError) {
      res.status(500).json({ error: 'Failed to update token' });
      return;
    }

    res.json({ access_token: credentials.access_token });
  } catch {
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

export default router;
