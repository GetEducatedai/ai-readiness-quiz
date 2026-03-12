export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, archetype, score, tools } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Name and email required' });
  }

  const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
  const LIST_ID = 'U8MQmf'; // AI Quiz Leads

  try {
    // 1. Create/update profile with custom properties
    const profileRes = await fetch('https://a.klaviyo.com/api/profiles/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'revision': '2024-02-15',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          type: 'profile',
          attributes: {
            email,
            first_name: name.split(' ')[0],
            last_name: name.split(' ').slice(1).join(' ') || '',
            properties: {
              ai_archetype: archetype || '',
              ai_readiness_score: score || 0,
              ai_tools_recommended: tools ? tools.join(', ') : '',
              quiz_completed_at: new Date().toISOString(),
              source: 'AI Readiness Quiz',
            },
          },
        },
      }),
    });

    let profileId;
    const profileData = await profileRes.json();

    if (profileRes.ok) {
      profileId = profileData.data.id;
    } else if (profileRes.status === 409) {
      // Profile already exists — get their ID from the error
      profileId = profileData.errors?.[0]?.meta?.duplicate_profile_id;
      if (!profileId) throw new Error('Could not resolve duplicate profile');

      // Update their properties
      await fetch(`https://a.klaviyo.com/api/profiles/${profileId}/`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
          'revision': '2024-02-15',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            type: 'profile',
            id: profileId,
            attributes: {
              properties: {
                ai_archetype: archetype || '',
                ai_readiness_score: score || 0,
                ai_tools_recommended: tools ? tools.join(', ') : '',
                quiz_completed_at: new Date().toISOString(),
              },
            },
          },
        }),
      });
    } else {
      throw new Error(`Profile creation failed: ${JSON.stringify(profileData)}`);
    }

    // 2. Add profile to AI Quiz Leads list
    await fetch(`https://a.klaviyo.com/api/lists/${LIST_ID}/relationships/profiles/`, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'revision': '2024-02-15',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [{ type: 'profile', id: profileId }],
      }),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Klaviyo error:', err);
    return res.status(500).json({ error: 'Failed to subscribe' });
  }
}
