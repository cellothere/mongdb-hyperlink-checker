# 📡 mongodb-hyperlink-checker

A Node.js utility that connects to a MongoDB cluster, allows the user to select a database and collection, automatically detects fields that contain links (both single strings and arrays of strings), and checks each link for validity.

Special handling is included for YouTube links to detect unavailable or removed videos. The application displays real-time progress updates (e.g., `Checking link 23/200`) so the user knows which link is currently being processed.

---

## 🚀 Features

- ✅ Loads MongoDB URI from a `.env.local` file
- ✅ Interactive selection of database and collection
- ✅ Auto-detects fields containing links by sampling documents
- ✅ Handles fields that contain either a single string or an array of strings
- ✅ Extracts and checks all URLs within those fields
- ✅ Special fallback and validation for YouTube links
- ✅ Displays live progress (e.g., `Checking link 23/200`)
- ✅ Logs broken links along with document ID and field name for easy review

---

## 📁 Setup Instructions

### 1. Clone the repository:
```bash
git clone https://github.com/yourusername/mongodb-hyperlink-checker.git
cd checkCollectionLinks
```

### 2. Install dependencies:
```bash
npm install dotenv mongodb node-fetch
```

### 3. Create a `.env.local` file:
```
MONGODB_URI=your-mongodb-connection-string-here
```

### 4. Run the script:
```bash
node checkCollectionLinks.js
```

Follow the interactive prompts to:
- Select a database
- Select a collection
- Let the app scan sample documents to detect link fields
- Watch the live progress as it checks each link

---

## 🛠 Example output
```
Available Databases:
1. abc_db
2. test_db

Enter the number or name of the database to review: 1

Available Collections:
1. collection_q
2. collection_z

Enter the number or name of the collection to review: 1

Detected fields that may contain links:
- purchase_link
- audio_link

Total links to check: 172
Checking link 1/172
Checking link 2/172
❌ Broken link in field "audio_link" for document _id: 64ab4b7a4e9c7c09a1e507d1 -> https://www.youtube.com/watch?v=badlink123 (link 14/172)

Link check complete! Processed 38 documents and found 3 broken links.
```


