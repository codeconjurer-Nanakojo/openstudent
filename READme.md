# 🎓 OpenStudent

**OpenStudent** is a student-powered academic archive for IT-related programs across Ghanaian universities. It empowers students to share, explore, and reuse academic projects — fostering collaboration, recognition, and growth.

---

## 🌍 Vision

To build a nationwide, inclusive platform where students can:
- Upload and showcase academic projects
- Earn recognition and rewards for contributions
- Access curated learning resources from peers
- Collaborate across institutions and disciplines

---

## 🧱 Tech Stack

- **Frontend**: HTML, CSS, JavaScript (mobile-first)
- **Backend**: Supabase (PostgreSQL, Auth, RLS)
- **Storage**: MEGA API (project files), ImageKit (images)
- **Payments**: Paystack (revenue sharing, contributor payouts)

---

## 📦 Core Features

- Multi-university support (UMaT, KNUST, UG, etc.)
- Flexible project submission (GitHub, direct upload)
- Contributor incentives: points, badges, revenue sharing
- Premium access unlocks via contribution points
- Blog system for student reflections and insights
- Admin dashboard for moderation and analytics
- Team submissions and verified project tags
- Contributor withdrawal system with threshold enforcement

---

## 🔐 Access Control

- **Public users** can browse projects, read blogs, and view leaderboards
- **Logged-in contributors** can submit projects, write blogs, comment, request payouts, and access dashboards
- **Admins** can moderate submissions, manage payouts, and view analytics

---

## 🗃️ Directory Structure

See `structure` file for full breakdown of folders and files.

---

## 🚀 Development Strategy

We’re building OpenStudent **step by step**, one page at a time:
1. `login.html` → Auth flow
2. `add_project.html` → Submission form
3. `admin.html` → Moderation dashboard
4. `projects.html` → Public archive
5. `profile.html` → Contributor dashboard
6. `blog/index.html` → Blog listing
7. `analytics.html` → Admin stats
8. `withdrawals.html` → Contributor payout requests

---

## 🧠 Future Plans

- Mobile-first UI for low-bandwidth users
- Multilingual support (Twi, Ewe, Hausa)
- Accessibility features (screen reader, alt text)
- Research collaboration hub
- OpenStudent API
- Project evolution tracker

---

## 🤝 Contributing

See `CONTRIBUTING.md` for guidelines on how to get involved.

---

## 📄 License

This project is open-source. See `LICENSE.md` for details.
