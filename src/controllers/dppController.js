// ── Imports (always at the top) ──────────────────────────────
const pool = require('../config/db');
const nodemailer = require('nodemailer');

// ── Helpers ──────────────────────────────────────────────────

// Reads the score row from the DB function and turns the text numbers
// into real numbers (Postgres sends bigint/numeric as strings).
// dbo.fn_get_assessment_score returns a TABLE row, not JSON.
const fetchScore = async (ass_id) => {
  const result = await pool.query('SELECT * FROM dbo.fn_get_assessment_score($1)', [ass_id]);
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
     return {
    ass_id: Number(r.ass_id),
    total_questions: Number(r.total_questions),
    answered_count: Number(r.answered_count),
    yes_count: Number(r.yes_count),
    no_count: Number(r.answered_count) - Number(r.yes_count),
    not_answered_count: Number(r.total_questions) - Number(r.answered_count),
    score_percentage: Number(r.score_percentage),
  };
};
// Small helper so names containing < or & cannot break the email HTML
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

// Emails the report to the address saved at contact time.
// The address always comes from the database, never from the request.
const sendReportEmail = async (ass_id, score, nextLevel) => {
  // 1) Find the email that was saved in /api/contact-details
  const contactResult = await pool.query(
    'SELECT full_name, email FROM dbo.assessment_contact WHERE ass_id = $1',
    [ass_id]
  );
  if (contactResult.rows.length === 0) {
    console.error('No contact found for ass_id', ass_id);
    return;
  }
  const { full_name, email } = contactResult.rows[0];

  // 2) Stop early if email settings are missing in .env
  const missingSmtp = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].filter(
    (k) => !process.env[k]
  );
  if (missingSmtp.length > 0) {
    console.error('Email not configured, missing env vars:', missingSmtp.join(', '));
    return;
  }

  // 3) Values used in the design
  const REPUT_LINK = 'https://www.reput.ai/';
  const cut = (v, n) => String(v ?? '').slice(0, n);
  const scoreText = Number(score.score_percentage) || 0;
  const barPct = Math.max(0, Math.min(100, Math.round(scoreText)));

  // Card text: use what the screen sent, otherwise a default card
  const card = {
    eyebrow: cut(nextLevel?.eyebrow, 100) || 'Your next level: map your chain',
    title: cut(nextLevel?.title, 150) || 'Let\u2019s start by mapping who supplies what',
    body:
      cut(nextLevel?.body, 500) ||
      'A clear picture of your tiers is where everyone starts. We\u2019ll map your suppliers with you, then invite them in and collect their data step by step.',
    cta: cut(nextLevel?.cta, 100) || 'Help me map my chain',
  };

  // 4) Email layout (same design as dpp-readiness-report-email.html)
  const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Your DPP Readiness Report</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .stat { display: block !important; width: 100% !important; padding: 0 0 10px 0 !important; }
    .score { font-size: 56px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef4f5;">

<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef4f5;">
  You're ${scoreText}% DPP-ready: ${score.answered_count} of ${score.total_questions} questions answered, ${score.no_count} gaps flagged.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef4f5;">
<tr><td align="center" style="padding:28px 12px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">

    <!-- Header -->
    <tr>
      <td class="px" style="background-color:#0b4f5c;background-image:linear-gradient(135deg,#0b4f5c 0%,#0a8f94 100%);padding:28px 36px 32px 36px;">
        <p style="margin:0 0 22px 0;font-size:13px;color:#bfe6e8;letter-spacing:0.3px;">BluWin &times; Reput.ai</p>
        <h1 style="margin:0;font-size:26px;line-height:1.25;color:#ffffff;font-weight:700;">Your DPP Readiness Report</h1>
        <p style="margin:8px 0 0 0;font-size:15px;line-height:1.5;color:#d9f1f2;">Hi ${esc(full_name)}, here's where you stand on Digital Product Passport readiness.</p>
      </td>
    </tr>

    <!-- Score -->
    <tr>
      <td class="px" style="padding:32px 36px 8px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:14px;color:#4a6168;padding-bottom:4px;">Overall readiness score</td>
          </tr>
          <tr>
            <td class="score" style="font-size:68px;line-height:1.05;font-weight:800;color:#0b4f5c;letter-spacing:-1.5px;">${scoreText}%</td>
          </tr>
          <tr>
            <td style="padding-top:16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#dcebed;border-radius:8px;">
                <tr>
                  <td width="${barPct}%" height="12" style="width:${barPct}%;background-color:#0a8f94;border-radius:8px;font-size:0;line-height:0;">&nbsp;</td>
                  <td height="12" style="font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:8px;font-size:12px;color:#6b8288;">${score.answered_count} of ${score.total_questions} questions answered</td>
          </tr>
        </table>
      </td>
    </tr>

        <!-- Stats -->
    <tr>
      <td class="px" style="padding:24px 36px 8px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="stat" width="50%" valign="top" style="padding:0 6px 12px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f8f9;border:1px solid #dcebed;border-radius:12px;">
                <tr><td style="padding:14px 16px;">
                  <div style="font-size:26px;font-weight:700;color:#0b4f5c;line-height:1.1;">${score.answered_count}<span style="font-size:15px;font-weight:500;color:#6b8288;"> / ${score.total_questions}</span></div>
                  <div style="font-size:13px;color:#4a6168;margin-top:4px;">Answered</div>
                </td></tr>
              </table>
            </td>
            <td class="stat" width="50%" valign="top" style="padding:0 0 12px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff8e8;border:1px solid #f3e3b8;border-radius:12px;">
                <tr><td style="padding:14px 16px;">
                  <div style="font-size:26px;font-weight:700;color:#9a6b00;line-height:1.1;">${score.not_answered_count}</div>
                  <div style="font-size:13px;color:#4a6168;margin-top:4px;">Not answered</div>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="stat" width="50%" valign="top" style="padding:0 6px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eaf7f0;border:1px solid #cfeadb;border-radius:12px;">
                <tr><td style="padding:14px 16px;">
                  <div style="font-size:26px;font-weight:700;color:#1b7a4b;line-height:1.1;">${score.yes_count}</div>
                  <div style="font-size:13px;color:#4a6168;margin-top:4px;">Yes</div>
                </td></tr>
              </table>
            </td>
            <td class="stat" width="50%" valign="top" style="padding:0 0 0 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fdf3f2;border:1px solid #f4d9d6;border-radius:12px;">
                <tr><td style="padding:14px 16px;">
                  <div style="font-size:26px;font-weight:700;color:#b3392f;line-height:1.1;">${score.no_count}</div>
                  <div style="font-size:13px;color:#4a6168;margin-top:4px;">No</div>
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Next level card -->
    <tr>
      <td class="px" style="padding:28px 36px 16px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a6b73;background-image:linear-gradient(135deg,#0a4f5e 0%,#079297 55%,#45a6a2 100%);border-radius:18px;">
          <tr>
            <td style="padding:22px 22px 24px 22px;">
              <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:2px;color:#cdeaec;text-transform:uppercase;padding-bottom:8px;">${esc(card.eyebrow)}</div>
              <div style="font-size:21px;line-height:1.3;font-weight:700;color:#ffffff;padding-bottom:10px;">${esc(card.title)}</div>
              <div style="font-size:15px;line-height:1.6;color:#e6f5f6;padding-bottom:20px;">${esc(card.body)}</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color:#ffffff;border-radius:12px;">
                    <a href="${REPUT_LINK}" target="_blank" rel="noopener" style="display:block;padding:15px 16px;font-size:15px;font-weight:700;color:#0a3f4c;text-decoration:none;border-radius:12px;">${esc(card.cta)} &middot; Connect with our team &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Support note -->
    <tr>
      <td class="px" style="padding:0 36px 32px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eaf6f7;border:1px solid #cfe7e9;border-radius:12px;">
          <tr>
            <td width="24" valign="top" style="padding:15px 0 15px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="20" height="20" align="center" valign="middle" style="width:20px;height:20px;border:2px solid #0a8f94;border-radius:12px;font-size:12px;line-height:16px;font-weight:700;color:#0a8f94;">&#10003;</td>
              </tr></table>
            </td>
            <td valign="top" style="padding:14px 18px 14px 12px;font-size:14px;line-height:1.55;color:#2b3f45;">
              Every &ldquo;No&rdquo; is something we can build together. RePut.ai and BluWin will hand-hold you through the gaps, step by step.
            </td>
          </tr>
        </table>
      </td>
    </tr>

       <!-- Footer -->
    <tr>
      <td class="px" style="background-color:#f6f9fa;border-top:1px solid #e3eef0;padding:20px 36px;">
        <p style="margin:0;font-size:13px;line-height:1.5;color:#6b8288;">
          &mdash; The BluWin &times; Reput.ai team<br>
          Questions? Reply to this email and we'll help.
        </p>
      </td>
    </tr>

    <!-- Legal disclaimer -->
    <tr>
      <td class="px" style="background-color:#f6f9fa;padding:0 36px 24px 36px;">
        <p style="margin:0;padding-top:16px;border-top:1px solid #e3eef0;font-size:11px;line-height:1.6;color:#8a9ea4;">
          <b>Legal Disclaimer:</b> This readiness scan and report are provided for general informational purposes only and are based on current and draft EU Ecodesign for Sustainable Products Regulation (ESPR) information. Final Digital Product Passport (DPP) data fields, access rules, and compliance timelines for textiles remain subject to the forthcoming EU textile delegated act. This assessment does not constitute legal advice, a formal compliance determination, or an official certification.
        </p>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;

  // 5) Send it
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  try {
    await transporter.verify();
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'Your DPP Readiness Report',
      html: emailHtml,
    });
    console.log('Sent to:', email);
    console.log('Accepted:', info.accepted, 'Rejected:', info.rejected);
    console.log('Message ID:', info.messageId);
  } catch (err) {
    console.error('Report email failed to send:', err.code, err.response || err.message);
  }
};
// ── Insert Contact Details ───────────────────────────────────
// POST /api/contact-details
const insertContactDetails = async (req, res) => {
  try {
    const { full_name, company, email, role, tier_level, export_market_country } = req.body;

    const result = await pool.query(
      'SELECT dbo.fn_insert_assessment_contact($1, $2, $3, $4, $5, $6) AS result',
      [
        full_name,
        company,
        email,
        role || null,
        tier_level || null,
        export_market_country || null,
      ]
    );

    // The DB function returns JSON: { success, status_code, message, data }
    const response = result.rows[0].result;
    res.status(response.status_code).json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, status_code: 500, message: 'Something went wrong', data: null });
  }
};

// ── Update role / tier / markets on the contact row ──────────
// POST /api/contact-details/profile
const updateContactProfile = async (req, res) => {
  try {
    const ass_id = parseInt(req.body.ass_id, 10);
    const { role, tier_level, export_market_country } = req.body;

    if (!Number.isInteger(ass_id)) {
      return res.status(400).json({
        success: false,
        status_code: 400,
        message: 'Valid ass_id is required',
        data: null,
      });
    }

    const result = await pool.query(
      `UPDATE dbo.assessment_contact
       SET role = COALESCE(NULLIF($2, ''), role),
           tier_level = COALESCE(NULLIF($3, ''), tier_level),
           export_market_country = COALESCE(NULLIF($4, ''), export_market_country)
       WHERE ass_id = $1
       RETURNING ass_id, role, tier_level, export_market_country`,
      [ass_id, role ?? null, tier_level ?? null, export_market_country ?? null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        status_code: 404,
        message: 'Assessment contact not found',
        data: null,
      });
    }

   

    res.status(200).json({
      success: true,
      status_code: 200,
      message: 'Contact profile updated successfully',
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, status_code: 500, message: 'Something went wrong', data: null });
  }
};

// ── Get All Questions ────────────────────────────────────────
// GET /api/questions
const getAllQuestions = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dbo.fn_get_all_questions()');

    // The list rarely changes, so the browser may reuse it for 5 minutes
    res.set('Cache-Control', 'public, max-age=300');

    res.status(200).json({
      success: true,
      status_code: 200,
      message: 'Questions fetched successfully',
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, status_code: 500, message: 'Something went wrong', data: null });
  }
};

// ── Insert Answered Question ─────────────────────────────────
// POST /api/answered-que
// The DB function returns a plain number (que_id), not JSON,
// so we build the response here.
const insertAnsweredQue = async (req, res) => {
  try {
    const { ass_id, role, tier_level, que_id, ans } = req.body;

    // Basic check before touching the database
    if (!ass_id || !que_id || !['Yes', 'No'].includes(ans)) {
      return res.status(400).json({
        success: false,
        status_code: 400,
        message: 'ass_id, que_id and ans (Yes or No) are required',
        data: null,
      });
    }

    await pool.query(
      'SELECT dbo.fn_insert_answered_que($1, $2, $3, $4, $5) AS result',
      [ass_id, role, tier_level, que_id, ans]
    );

    res.status(200).json({ success: true, status_code: 200, message: 'Answer saved', data: { que_id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, status_code: 500, message: 'Something went wrong', data: null });
  }
};

// ── Get Assessment Score (+ optional email) ──────────────────
// GET /api/score/:ass_id            → score only
// GET /api/score/:ass_id?send_email=true → score + email the report
const getAssessmentScoreV2 = async (req, res) => {
  try {
    const ass_id = parseInt(req.params.ass_id, 10);
    if (!Number.isInteger(ass_id)) {
      return res.status(400).json({ success: false, status_code: 400, message: 'Invalid ass_id', data: null });
    }

    const score = await fetchScore(ass_id);
    if (!score) {
      return res
        .status(404)
        .json({ success: false, status_code: 404, message: 'No score found for this assessment', data: null });
    }

     // The person reached the score screen: mark the assessment as completed (only the first time)
    await pool.query(
      'UPDATE dbo.assessment_contact SET completed_at = COALESCE(completed_at, now()) WHERE ass_id = $1',
      [ass_id]
    );
    // Reply first so the user does not wait for the email
    res.status(200).json({ success: true, status_code: 200, message: 'Score fetched successfully', data: score });

    // Email only when the frontend sent ?send_email=true
    if (req.query.send_email === 'true') {
      sendReportEmail(ass_id, score).catch((err) => {
        console.error('Background email send failed:', err);
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, status_code: 500, message: 'Something went wrong', data: null });
  }
};

// ── Email Report ("Email me the full report" button) ─────────
// POST /api/email-report   body: { ass_id }
// Reuses the same helper, so the email logic lives in one place
const emailReport = async (req, res) => {
  try {
    const ass_id = parseInt(req.body.ass_id, 10);
    if (!Number.isInteger(ass_id)) {
      return res.status(400).json({ success: false, status_code: 400, message: 'Invalid ass_id', data: null });
    }

    const score = await fetchScore(ass_id);
    if (!score) {
      return res
        .status(404)
        .json({ success: false, status_code: 404, message: 'No score found for this assessment', data: null });
    }

    // Reply first, then send the email in the background
    res.status(200).json({ success: true, status_code: 200, message: 'Report is being sent', data: null });

        const nextLevel = req.body.next_level || null;
    sendReportEmail(ass_id, score, nextLevel).catch((err) => {
      console.error('Background email send failed:', err);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, status_code: 500, message: 'Something went wrong', data: null });
  }
};

//POST/api/demo_request body{ass_id }
const insertDemoRequest = async(req,res) =>{
  try{
    const ass_id = parseInt(req.body.ass_id,10);
    if (!Number.isInteger(ass_id)){
      return res.status(400).json({success: false, status_code:400, message:'/valid ass_id required', data:null});

    }
    const result   = await pool.query('SELECT dbo.fn_insert_demo_request($1) As  result',[ass_id]);
    const response = result.rows[0].result;
    res.status(response.status_code).json(response);

  }catch(err){
    console.error(err);
    res.status(500).json({success:false, status_code:500, message:'Something went wrong', data:null});
  }
}


module.exports = {
  insertContactDetails,
  insertAssessmentContact: insertContactDetails,
  updateContactProfile,
  getAllQuestions,
  insertAnsweredQue,
  getAssessmentScoreV2,
  emailReport,
  insertDemoRequest
};
