export async function sendLicenseEmail({ to, licenseKey, tierName, validationUrl }, env) {
  if (!to) {
    console.warn("[Email Service] No recipient email address provided.");
    return { success: false, reason: "Missing recipient email" };
  }

  // 1. PRIMARY PROVIDER & LIST SYNC: INFLUENCERSOFT API
  const apiKey = (env && env.INFLUENCERSOFT_KEY) || '81f4a860932fbaf82520b6e92e5a3d1c';
  const listId = (env && env.INFLUENCERSOFT_LIST_ID) || '1785798910.8796525520';

  if (apiKey) {
    try {
      const params = new URLSearchParams();
      params.append('rpsKey', apiKey);
      params.append('lead_email', to);
      params.append('add_to_lists', listId);
      params.append('lead_description', licenseKey);

      const response = await fetch('https://gamerxise.influencersoft.com/api/addupdatelead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });

      if (response.ok) {
        let data;
        try { data = await response.json(); } catch (e) { data = { text: await response.text() }; }
        console.log('[Email Service] Successfully synced lead & List ID via InfluencerSoft API to:', to, data);
        return { success: true, provider: 'influencersoft', data };
      } else {
        const errorText = await response.text();
        console.error('[Email Service] InfluencerSoft API error response:', response.status, errorText);
      }
    } catch (err) {
      console.error('[Email Service] InfluencerSoft execution failed:', err.message);
    }
  }

  // 2. FALLBACK PROVIDER: RESEND API
  if (env && env.RESEND_API_KEY) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'XSITES <onboarding@resend.dev>',
          to: [to],
          subject: `⚡ Your XSITES License Key (${tierName || 'Activated'})`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-size: 11px; font-weight: bold; letter-spacing: 2px; color: #107c10; text-transform: uppercase; background-color: #f0fdf4; padding: 4px 12px; border-radius: 9999px; border: 1px solid #bbf7d0;">XSITES Engine</span>
                <h1 style="font-size: 22px; font-weight: 900; color: #0f172a; margin-top: 12px; margin-bottom: 4px;">Thank You for Your Order!</h1>
                <p style="font-size: 13px; color: #64748b; margin: 0;">Your workspace has been successfully activated on the <strong>${tierName || 'XSITES'}</strong> plan.</p>
              </div>

              <div style="background-color: #090d16; padding: 20px; border-radius: 10px; border: 1px solid #1e293b; text-align: center; margin-bottom: 24px;">
                <div style="font-size: 10px; font-family: monospace; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">Workspace Activation Key</div>
                <div style="font-size: 20px; font-family: monospace; font-weight: bold; color: #00ff66; letter-spacing: 2px; word-break: break-all;">
                  ${licenseKey}
                </div>
              </div>

              <p style="font-size: 13px; line-height: 1.6; color: #334155;">
                Copy your activation key above and paste it into the <strong>🔑 Workspace Activation Key</strong> input on the XSITES studio builder.
              </p>

              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <div style="font-size: 11px; color: #94a3b8; text-align: center; font-family: monospace;">
                Xstream Flex XSITES Engine • support@xstreamflex.com
              </div>
            </div>
          `
        })
      });

      const resendData = await resendRes.json();
      if (resendRes.ok) {
        console.log('[Email Service] Successfully sent via Resend API to:', to);
        return { success: true, provider: 'resend', data: resendData };
      }
    } catch (err) {
      console.error('[Email Service] Resend execution failed:', err.message);
    }
  }

  console.warn('[Email Service] Skipped email delivery: INFLUENCERSOFT_KEY secret is unassigned on the Cloudflare Worker environment.');
  return { success: false, reason: "INFLUENCERSOFT_KEY not set in worker environment" };
}

