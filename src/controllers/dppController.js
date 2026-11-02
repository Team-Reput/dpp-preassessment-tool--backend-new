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
const sendReportEmail = async (ass_id, score) => {
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

  // 3) Build the email body from the score
  const emailHtml = `
    <h2>Your DPP Readiness Report</h2>
    <p>Hi ${esc(full_name)},</p>
    <p>Your overall readiness score is <strong>${score.score_percentage}%</strong>.</p>
    <ul>
      <li>Questions answered: ${score.total_questions}</li>
      <li>Yes: ${score.yes_count}</li>
      <li>No: ${score.no_count}</li>
    </ul>
    <p>— BluWin × Reput.ai</p>
  `;

  // 4) Send it
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Your DPP Readiness Report',
    html: emailHtml,
  });
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

    sendReportEmail(ass_id, score).catch((err) => {
      console.error('Background email send failed:', err);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, status_code: 500, message: 'Something went wrong', data: null });
  }
};

module.exports = {
  insertContactDetails,
  insertAssessmentContact: insertContactDetails,
  updateContactProfile,
  getAllQuestions,
  insertAnsweredQue,
  getAssessmentScoreV2,
  emailReport,
};
