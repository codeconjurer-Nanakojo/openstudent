
---

## 🧠 Tech Stack

| Layer        | Tool               | Purpose                                      |
|--------------|--------------------|----------------------------------------------|
| **Frontend** | HTML, CSS, JS       | Static site layout and interactivity         |
| **Database** | Supabase (PostgreSQL) | Store project metadata and blog posts     |
| **Storage**  | Supabase Storage + ImageKit.io | Host project files and images         |
| **Hosting**  | GitHub Pages        | Free deployment of static site               |
| **Version Control** | GitHub       | Code management and collaboration            |

---

## 🗃️ Supabase Schema (Draft)

### Table: `projects`

| Field        | Type   | Description                        |
|--------------|--------|------------------------------------|
| `id`         | int    | Primary key                        |
| `title`      | text   | Project title                      |
| `course`     | text   | MSSQL, MongoDB, etc.               |
| `semester`   | text   | e.g., Level 200, Semester 1        |
| `tools_used` | text   | e.g., SQL Server, MongoDB Compass  |
| `description`| text   | Summary of the project             |
| `image_url`  | text   | Thumbnail or screenshot            |
| `file_url`   | text   | Link to ZIP or PDF                 |

---

## 🧩 Integration Strategy

- Use Supabase JS SDK to fetch project metadata dynamically
- Store images on ImageKit.io and link via CDN
- Store downloadable files (ZIPs, PDFs) on Supabase Storage or GitHub Releases
- Display project cards on `index.html` with links to full posts

---

## 🔮 Future Roadmap

### Phase 2: Dynamic Expansion
- Add search and filter by course, semester, or tags
- Enable student contributions via form or GitHub pull requests
- Add blog section with study tips and reflections
- Create downloadable study packs (PDFs with diagrams and code)

### Phase 3: Advanced Features
- Authentication for contributors (Supabase Auth)
- Analytics dashboard (views, downloads, popular projects)
- Quiz generator based on project content
- Scenario simulator for exam-style challenges
- Video walkthroughs of selected projects

---

## 🎨 Design Guidelines

- Clean academic theme (navy, white, accent color)
- Responsive layout for mobile and desktop
- Icons for databases, code, and collaboration
- Consistent typography and spacing

---

## 📢 Promotion Strategy

- Share with lecturers and student groups
- Post in WhatsApp and Telegram forums
- Create flyers or posters for campus
- Add social media links (LinkedIn, GitHub, etc.)

---

## 🧪 Testing Checklist

| Area         | Test                                      |
|--------------|-------------------------------------------|
| Supabase     | Insert, fetch, and display project data   |
| ImageKit     | Load images quickly via CDN               |
| GitHub Pages | Site loads correctly on desktop/mobile    |
| File Downloads | ZIPs and PDFs open without delay       |
| Responsiveness | Layout adapts to screen sizes          |

---

## 👤 About the Founder

**Nana Kojo** is a systems thinker and ambitious learner with a passion for embedded systems, databases, and scenario-based reasoning. OpenStudent is his way of giving back—turning past projects into future learning tools for students across Ghana and beyond.
