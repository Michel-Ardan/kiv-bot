// backend\utils\fastjob.employer.utils.js
const chromium = require("playwright");
const { TimeoutError } = require("puppeteer");
const { normalizeTitle } = require("./string.utils");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { getAdminSession } = require("./session.utils");
const moment = require("moment");

const START_TIME = process.env.START_TIME || "0900"; // Default 09:00
const END_TIME = process.env.END_TIME || "2100"; // Default 21:00

const get_jobs = async () => {
  const session = await getAdminSession();
  if (!session) {
    console.log("❌ Could not start session.");
    return;
  }

  const { browser, page } = session;

  console.log("🔍 Navigating to job dashboard...");
  await page.goto("https://employer.fastjobs.sg/p/my-activity/jobs/", {
    waitUntil: "domcontentloaded",
  });
  console.log("✅ Job dashboard loaded.");

  await page.goto(
    `https://employer.fastjobs.sg/p/my-activity/jobs/?status=1&coyid=235927`,
    { waitUntil: "networkidle" } // Ensure all network requests are finished
  );
  // Close ONLY the feedback modal
  const feedbackModal = page.locator(
    'div.modal-dialog:has(h1:text("Share your thoughts about job posting"))'
  );

  if (
    (await feedbackModal.count()) > 0 &&
    (await feedbackModal.first().isVisible())
  ) {
    console.log("🔒 Feedback modal detected, attempting to close...");

    const closeButton = feedbackModal.locator("button.modal-close");
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(500);
      console.log("✅ Modal closed.");
    }
  }
  console.log("🔍 Extracting job listings...");
  const jobListings = await page.locator("div.panel-body").all();

  console.log(`📌 Found ${jobListings.length} possible job listings`);

  const jobDict = {}; // Store { jid: { job_title, job_url } }

  for (const job of jobListings) {
    try {
      const h3Elements = await job.locator("h3").all();
      let jobTitle = null;

      // **Find the correct <h3> element (ignore warnings like "Uh-oh, insufficient coins!")**
      for (const h3 of h3Elements) {
        const text = await h3.innerText();
        if (!text.includes("Uh-oh")) {
          // Ignore error messages
          jobTitle = text.trim();
          break;
        }
      }

      if (!jobTitle) {
        console.log("⚠️ Skipping invalid job block (No valid title found)");
        continue;
      }

      console.log(`🔗 Extracting job title: "${jobTitle}"`);

      // **Extract job URL**
      let jobURL = await job.locator("a").first().getAttribute("href");

      if (!jobURL) {
        console.log(
          `⚠️ Could not find a valid link for "${jobTitle}". Skipping.`
        );
        continue;
      }

      // **Ensure URL is absolute**
      if (!jobURL.startsWith("http")) {
        jobURL = new URL(jobURL, page.url()).href;
      }

      console.log(`🔗 Extracted job URL: ${jobURL}`);

      // **Extract Job ID (`jid`) from URL**
      const jidMatch = jobURL.match(/jid=(\d+)&coyid=/);
      const jid = jidMatch ? jidMatch[1] : null;

      if (!jid) {
        console.log(`⚠️ Could not extract Job ID for "${jobTitle}". Skipping.`);
        continue;
      }

      // **Store in final dictionary**
      jobDict[jid] = { job_title: jobTitle, job_url: jobURL };
    } catch (error) {
      console.log(`⚠️ Skipping job due to extraction error:`, error);
    }
  }
  await browser.close();

  return jobDict;
  // **Close the browser when done**
};

/**
 * Navigates to the job detail page for the given job ID using an admin session.
 * @param {string} jobID - The job ID to view details for.
 */
const moveKIV = async (jobID) => {
  const URL = `https://employer.fastjobs.sg/p/jobs/viewdetails/?jid=${jobID}&coyid=235927&sts=1&lblid=`;

  // Get a valid admin session (reuse if possible)
  const session = await getAdminSession();
  if (!session) {
    console.error("❌ Failed to get a valid admin session.");
    return;
  }

  const { browser, page } = session;

  try {
    console.log(`🌐 Navigating to job details page for Job ID: ${jobID}`);
    await page.goto(URL, { waitUntil: "networkidle" });
    const newCountText = await page.textContent(
      '#applications-sidebar li.active a[data-name="New"] span.count'
    );

    const count = newCountText ? parseInt(newCountText.trim(), 10) : null;

    if (count !== null) {
      console.log(`📥 Number of applications in 'New': ${count}`);
    } else {
      console.log("❓ Could not parse 'New' application count.");
    }

    const BATCHES = Math.ceil(count / 20);
    console.log(`🔁 Will process ${BATCHES} batch(es).`);

    for (let i = 0; i < BATCHES; i++) {
      console.log(`▶️ Processing batch ${i + 1} of ${BATCHES}`);
      await kivBatchOfTwenty(page, jobID);

      // 🔄 Reload page to refresh application list
      await page.reload({ waitUntil: "networkidle" });
      console.log("🔄 Page reloaded after batch");

      // ⏱️ Optional pause for stability
      await page.waitForTimeout(2000);
    }
  } catch (error) {
    console.error(`❌ Error navigating to job details: ${error.message}`);
  } finally {
    await browser.close();
    console.log("🧹 Browser closed after job page operation.");
  }
};

/**
 * Checks the first checkbox inside #application-actions,
 * clicks the "Move to" button, and unchecks the checkbox after interaction.
 * @param {object} page - The Playwright page object
 * @param {string|number} jobID - The job ID (used for logging or filename purposes)
 */
async function kivBatchOfTwenty(page, jobID) {
  try {
    console.log(`📦 Running kivBatchOfTwenty for Job ID: ${jobID}`);

    // ✅ Interact with checkbox inside #application-actions
    const container = page.locator("#application-actions");
    await container.waitFor({ timeout: 10000 });

    const checkbox = container.locator("fast-checkbox").first();
    await checkbox.waitFor({ timeout: 10000 });

    console.log("✅ fast-checkbox found inside #application-actions");

    await checkbox.click(); // Check
    console.log("☑️ fast-checkbox clicked (checked)");

    // 🕓 Wait for rendering (UI or data updates that depend on check)
    await page.waitForTimeout(2000);

    // ✅ Step 6: Locate the "Move to" button inside #application-actions
    const moveButton = container.locator(
      'button.button-container:has-text("Move to")'
    );
    await moveButton.waitFor({ timeout: 5000 });

    console.log("📍 'Move to' button located");

    await moveButton.click();
    console.log("🚀 'Move to' button clicked.");

    // Optionally wait for dropdown animation/rendering
    await page.waitForTimeout(1000);
    // 🔍 Locate the KIV button
    const kivButton = page.locator(
      'button.action-item[data-event="candidate_kept_in_mind"]'
    );
    await kivButton.waitFor({ timeout: 5000 });
    console.log("📍 KIV button located");
    // 🖱️ Click the KIV button
    await kivButton.click();
    console.log("✅ KIV button clicked.");
  } catch (error) {
    console.error(
      `❌ Error in kivBatchOfTwenty for Job ID ${jobID}: ${error.message}`
    );
  }
}


module.exports = { get_jobs,moveKIV};
