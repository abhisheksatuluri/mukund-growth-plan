// Build /output/data/revenue_model.json with all four streams + scenarios.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.env.OUTPUT_DIR || './output', 'data');

const model = {
  meta: {
    generated_at: new Date().toISOString(),
    currency: 'GBP',
    target_run_rate: 10000,
    current_run_rate_estimate: 5000,
    gap: 5000,
    notes: [
      'All assumptions are editable. Cash collected ≠ recognised monthly revenue.',
      'Online coaching: £997 / 3 months → £332.33/month recognised, or £997 cash if paid upfront.',
    ],
  },
  in_person_pt: {
    label: 'Stream 1 — In-Person Personal Training',
    inputs: {
      sessions_per_week: 27,
      avg_session_rate: 55,
      attendance_realisation: 0.78,
      weeks_per_month: 4.33,
    },
    formula: 'sessions_per_week × avg_session_rate × weeks_per_month × attendance_realisation',
    monthly_baseline_gbp: null,
    levers: [
      { name: 'Hold hours, +£10/session', delta_per_month: 1082.5, retention_risk: 'low-med' },
      { name: 'Convert 6 clients to 12-week packages (£1,500)', delta_per_month: 750, retention_risk: 'low' },
      { name: 'Add 4 × 2:1 sessions/week at £40pp', delta_per_month: 692.8, capacity_risk: 'low' },
      { name: 'Cap hours at 22, redirect time to online', delta_per_month: -700, capacity_freed_hours: 5 },
    ],
    benchmarks: {
      london_budget_pt: '£30-£60/session',
      london_mid_pt: '£60-£100/session',
      london_premium_pt: '£100-£200+/session',
      source: 'London PT pricing guides cited in brief; validate with competitor research',
    },
  },
  online_coaching: {
    label: 'Stream 2 — Online Coaching (£997/3 months)',
    price_gbp: 997,
    months: 3,
    monthly_recognised_per_client: 332.33,
    formulas: {
      cash_collected: 'new_clients_this_month × 997',
      recognised_revenue: 'active_clients × (997 / 3)',
    },
    scenarios_active_clients: [
      { active: 5, recognised_gbp: 1661.67 },
      { active: 10, recognised_gbp: 3323.33 },
      { active: 15, recognised_gbp: 4985 },
      { active: 20, recognised_gbp: 6646.67 },
      { active: 25, recognised_gbp: 8308.33 },
    ],
    scenarios_new_clients_upfront: [
      { new_per_month: 3, cash_gbp: 2991 },
      { new_per_month: 5, cash_gbp: 4985 },
      { new_per_month: 7, cash_gbp: 6979 },
      { new_per_month: 8, cash_gbp: 7976 },
      { new_per_month: 10, cash_gbp: 9970 },
    ],
    funnel_inbound: {
      target_sales_per_month: 5,
      close_rate: 0.30,
      qualified_calls: 17,
      show_rate: 0.70,
      booked_calls: 25,
      application_to_booked_rate: 0.40,
      applications: 63,
      lead_to_application_rate: 0.20,
      leads: 315,
      profile_to_lead_rate: 0.20,
      profile_visits: 1575,
    },
    funnel_warm_dm: {
      warm_dms_per_month: 80,
      replies: 40,
      conversations: 25,
      applications: 15,
      booked_calls: 10,
      shows: 7,
      closes: 3.5,
    },
    combined_target: {
      inbound_closes: 1.5,
      outbound_closes: 3.5,
      total_per_month: 5,
    },
    deliverables: [
      'Personalised training plan',
      'Nutrition framework',
      'Weekly check-ins (video reply)',
      'Progress tracking',
      'Form review videos',
      'Habit/accountability system',
      'WhatsApp support (defined hours)',
      'Monthly live group Q&A',
    ],
  },
  corporate: {
    label: 'Stream 3 — Corporate Wellness',
    package_ladder: [
      { name: 'Single workshop / lunch-and-learn', price_gbp_min: 500, price_gbp_max: 1500, sales_cycle_weeks: 2 },
      { name: '4-week team challenge', price_gbp_min: 1500, price_gbp_max: 3000, sales_cycle_weeks: 4 },
      { name: 'Monthly wellbeing retainer', price_gbp_min: 2000, price_gbp_max: 5000, sales_cycle_weeks: 6 },
      { name: 'Executive transformation cohort', price_gbp_min: 3000, price_gbp_max: 10000, sales_cycle_weeks: 8 },
    ],
    funnel_outbound: {
      targeted_prospects_per_month: 150,
      meaningful_engagement_rate: 0.30,
      reply_rate: 0.10,
      replies: 15,
      discovery_calls: 8,
      proposals: 3,
      pilots_closed: 1,
      retainers_won_month_3_4: 1,
    },
    market_size: {
      uk_corporate_wellness_2026_gbp: 708200000,
      source_label: 'IBISWorld 2026 estimate (cited in brief)',
      uk_broader_wellbeing_2025_usd: 3000000000,
      source_label_2: 'IMARC 2025 estimate (cited in brief)',
    },
    target_buyer_personas: ['HR/People Ops', 'Office managers', 'Founders of 20-200 person firms', 'Benefits managers'],
  },
  content: {
    label: 'Stream 4 — Content (Lead Engine, not direct revenue)',
    role: 'Demand generation + trust + lead capture for streams 1-3',
    weekly_production: {
      youtube_longform: 1,
      shorts_from_each_long: { min: 5, max: 8 },
      instagram_reels: 3,
      tiktok_posts: 3,
      linkedin_posts: 2,
      newsletter_email: 1,
    },
    near_term_direct_revenue_gbp: 0,
    monetisation_routes_long_term: ['ad revenue (post YPP eligibility)', 'affiliate', 'brand deals', 'lead-gen for owned offers (primary)'],
  },
  scenarios: {
    A_fast_cash: {
      label: 'Scenario A — Fast Cash Path (upfront billing)',
      lines: [
        { stream: 'In-Person PT', gbp: 5000, note: 'current run-rate' },
        { stream: 'Online (5 new × £997 upfront)', gbp: 4985 },
        { stream: 'Corporate (1 workshop)', gbp: 1000 },
      ],
      total_gbp: 10985,
    },
    B_run_rate: {
      label: 'Scenario B — Stable Run-Rate Path (recognised)',
      lines: [
        { stream: 'In-Person PT (price/package lift)', gbp: 5500 },
        { stream: 'Online (15 active × £332.33)', gbp: 4985 },
      ],
      total_gbp: 10485,
    },
    C_balanced: {
      label: 'Scenario C — Balanced Path',
      lines: [
        { stream: 'In-Person PT', gbp: 5500 },
        { stream: 'Online (9 active recognised)', gbp: 2991 },
        { stream: 'Corporate retainer', gbp: 2000 },
        { stream: 'Workshop / affiliate', gbp: 500 },
      ],
      total_gbp: 10991,
    },
    D_premium: {
      label: 'Scenario D — Premium Positioning Path',
      lines: [
        { stream: 'PT effective rate lift', gbp: 1000, note: 'on top of £5k base = £6,000' },
        { stream: 'Base PT', gbp: 5000 },
        { stream: 'Online (10 active recognised)', gbp: 3323 },
        { stream: 'Corporate pilot/retainer', gbp: 1500 },
      ],
      total_gbp: 10823,
    },
  },
  recommended_path: 'B_run_rate',
  recommended_path_notes: [
    'Hits £10k recognised, smoother than upfront-only.',
    'Decouples revenue from new sales velocity each month.',
    'Allows churn buffer: 15 active assumes ~5 new every month with ~3-month tenure.',
    'A is the better target if Mukund prefers cash now over predictability.',
  ],
  data_integrity: {
    user_provided: ['£997/3-month price', '~25-30 PT hours/week', '£50-£60/session', 'channels: YT/IG/TT/LI', 'roughly £5k/month current'],
    verified_scraped: ['Follower count: 29,206', '50 posts spanning Jan 30 → Mar 25 2026', 'Avg engagement rate ~0.44%', 'Only 2 of 50 posts contain explicit CTA, only 1 = apply/DM', 'Avg video views ~955 across reels'],
    inferred: ['PT capacity is near full', 'Audience is global not London-specific (will validate with comments)', 'Bio CTA ("DM ELITE") is the only consistent conversion mechanism'],
    assumptions: ['Close rates, show rates, cost-per-lead in funnels are benchmark estimates', 'Corporate funnel rates are directional', 'Attendance realisation 0.78 for PT'],
    unknown: ['Exact active client counts', 'Email list size', 'Renewal rate after 3 months', 'Cancellation/no-show rate', 'Gym rent/commission'],
  },
};

// Compute baseline PT revenue
const pt = model.in_person_pt.inputs;
model.in_person_pt.monthly_baseline_gbp =
  +(pt.sessions_per_week * pt.avg_session_rate * pt.weeks_per_month * pt.attendance_realisation).toFixed(0);

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, 'revenue_model.json'), JSON.stringify(model, null, 2));
console.log('[revenue] wrote revenue_model.json — PT baseline £' + model.in_person_pt.monthly_baseline_gbp);
