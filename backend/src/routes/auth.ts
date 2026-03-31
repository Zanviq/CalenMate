import { Router, Response } from 'express';
import { google } from 'googleapis';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';

const router = Router();

router.use(authMiddleware);

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
