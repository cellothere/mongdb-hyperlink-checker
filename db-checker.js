/**
 * checkCollectionLinks.js
 *
 * This application loads the MongoDB URI from a .env.local file,
 * connects to the MongoDB cluster, lists available databases and collections,
 * and then allows the user to select a database and a collection.
 *
 * It then inspects a sample of documents to auto-detect fields containing links,
 * computes a total link count for progress reporting, and then iterates through
 * all documents to check each link. If a link is broken, a detailed message is printed.
 */

require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');
const readline = require('readline');

// Use dynamic import for node-fetch
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Extracts URLs from a string using a regex.
 * @param {string} text - The text to extract URLs from.
 * @returns {Array<string>} - An array of URLs found.
 */
function extractUrlsFromText(text) {
  const urlRegex = /(https?:\/\/[^\s"']+)/g;
  return text.match(urlRegex) || [];
}

/**
 * Checks if a URL is broken.
 * Uses GET for YouTube links to check for unavailable phrases,
 * otherwise attempts a HEAD request (with a GET fallback if needed).
 * @param {string} url - The URL to check.
 * @returns {Promise<boolean>} - Resolves to true if the URL is broken, false otherwise.
 */
async function checkUrl(url) {
  try {
    if (!url || url.trim() === '') return false;

    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

    if (isYouTube) {
      const response = await fetch(url, { method: 'GET' });
      const text = await response.text();

      const unavailablePhrases = [
        'This video is no longer available',
        'Video unavailable',
        'This video is private',
        'has been removed' // catch-all for removals
      ];

      return unavailablePhrases.some(phrase => text.includes(phrase));
    } else {
      // Normal HEAD check for other URLs
      let response = await fetch(url, { method: 'HEAD' });
      if (response.status === 404) {
        response = await fetch(url, { method: 'GET' });
        return response.status === 404;
      }
      return false;
    }
  } catch (error) {
    console.error(`Error checking ${url}: ${error.message}`);
    return true; // Treat errors as broken
  }
}

/**
 * Prompts the user with a question and returns the input.
 * @param {string} question - The prompt question.
 * @returns {Promise<string>} - The user's input.
 */
async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(question, answer => {
    rl.close();
    resolve(answer);
  }));
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Error: MONGODB_URI is not defined in the .env.local file.");
    process.exit(1);
  }

  const client = new MongoClient(uri, { useUnifiedTopology: true });
  try {
    await client.connect();
    console.log("Connected to MongoDB successfully.");

    // List databases using the admin interface.
    const adminDb = client.db().admin();
    const dbsResult = await adminDb.listDatabases();
    console.log("\nAvailable Databases:");
    dbsResult.databases.forEach((db, index) => {
      console.log(`${index + 1}. ${db.name}`);
    });

    // Prompt user to select a database.
    let dbAnswer = await prompt("\nEnter the number or name of the database to review: ");
    dbAnswer = dbAnswer.trim();
    let selectedDbName = dbAnswer;
    if (!isNaN(dbAnswer)) {
      const index = parseInt(dbAnswer, 10) - 1;
      if (index < 0 || index >= dbsResult.databases.length) {
        console.error("Invalid selection. Exiting.");
        process.exit(1);
      }
      selectedDbName = dbsResult.databases[index].name;
    } else {
      const exists = dbsResult.databases.some(db => db.name === selectedDbName);
      if (!exists) {
        console.error("Database name not found. Exiting.");
        process.exit(1);
      }
    }
    console.log(`\nYou selected the database: ${selectedDbName}`);

    // List collections in the selected database.
    const db = client.db(selectedDbName);
    const collections = await db.listCollections().toArray();
    if (collections.length === 0) {
      console.error("No collections found in the selected database. Exiting.");
      process.exit(1);
    }
    console.log("\nAvailable Collections:");
    collections.forEach((coll, index) => {
      console.log(`${index + 1}. ${coll.name}`);
    });

    // Prompt user to select a collection.
    let collAnswer = await prompt("\nEnter the number or name of the collection to review: ");
    collAnswer = collAnswer.trim();
    let selectedCollectionName = collAnswer;
    if (!isNaN(collAnswer)) {
      const index = parseInt(collAnswer, 10) - 1;
      if (index < 0 || index >= collections.length) {
        console.error("Invalid collection selection. Exiting.");
        process.exit(1);
      }
      selectedCollectionName = collections[index].name;
    } else {
      const exists = collections.some(coll => coll.name === selectedCollectionName);
      if (!exists) {
        console.error("Collection name not found. Exiting.");
        process.exit(1);
      }
    }
    console.log(`\nYou selected the collection: ${selectedCollectionName}`);

    const collection = db.collection(selectedCollectionName);

    // Inspect a sample of documents (10) to detect candidate fields that may contain links.
    console.log("\nInspecting sample documents to detect fields containing links...");
    const sampleDocs = await collection.find({}).limit(10).toArray();
    const candidateFields = new Set();
    sampleDocs.forEach(doc => {
      Object.keys(doc).forEach(key => {
        const value = doc[key];
        if (typeof value === 'string') {
          if (value.includes('http://') || value.includes('https://')) {
            candidateFields.add(key);
          }
        } else if (Array.isArray(value)) {
          if (value.some(item => typeof item === 'string' && (item.includes('http://') || item.includes('https://')))) {
            candidateFields.add(key);
          }
        }
      });
    });

    if (candidateFields.size === 0) {
      console.log("No fields containing links were detected in the sample documents.");
      process.exit(0);
    }

    console.log("Detected fields that may contain links:");
    candidateFields.forEach(field => console.log(`- ${field}`));

    // Load all documents from the collection.
    const docs = await collection.find({}).toArray();

    // First pass: count total links across candidate fields.
    let totalLinks = 0;
    docs.forEach(doc => {
      candidateFields.forEach(field => {
        const value = doc[field];
        if (!value) return;
        let urls = [];
        if (typeof value === 'string') {
          urls = extractUrlsFromText(value);
          if (urls.length === 0 && (value.startsWith('http://') || value.startsWith('https://'))) {
            urls.push(value);
          }
        } else if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'string') {
              let extracted = extractUrlsFromText(item);
              if (extracted.length === 0 && (item.startsWith('http://') || item.startsWith('https://'))) {
                extracted.push(item);
              }
              urls = urls.concat(extracted);
            }
          });
        }
        totalLinks += urls.length;
      });
    });

    console.log(`\nTotal links to check: ${totalLinks}`);
    let currentLink = 0;
    let brokenLinksCount = 0;

    // Second pass: check each link and report progress.
    for (const doc of docs) {
      for (const field of candidateFields) {
        const value = doc[field];
        if (!value) continue;
        let urls = [];
        if (typeof value === 'string') {
          urls = extractUrlsFromText(value);
          if (urls.length === 0 && (value.startsWith('http://') || value.startsWith('https://'))) {
            urls.push(value);
          }
        } else if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'string') {
              let extracted = extractUrlsFromText(item);
              if (extracted.length === 0 && (item.startsWith('http://') || item.startsWith('https://'))) {
                extracted.push(item);
              }
              urls = urls.concat(extracted);
            }
          });
        }
        for (const url of urls) {
          currentLink++;
          const broken = await checkUrl(url);
          if (broken) {
            console.log(`\n❌ Broken link in field "${field}" for document _id: ${doc._id} -> ${url} (link ${currentLink}/${totalLinks})`);
            brokenLinksCount++;
          } else {
            process.stdout.write(`Checking link ${currentLink}/${totalLinks} \r`);
          }
        }
      }
    }

    console.log(`\n\nLink check complete! Processed ${docs.length} documents and found ${brokenLinksCount} broken links.`);
  } catch (error) {
    console.error("Error occurred:", error);
  } finally {
    await client.close();
    process.exit(0);
  }
}

main();

