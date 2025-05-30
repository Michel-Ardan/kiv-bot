const { chromium } = require("playwright");
const fs = require("fs");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const SESSION_FILE = require("path").join(__dirname, "session.json");
/**
 * Launches a Playwright browser session and logs in (if needed).
 * @param {string} email - Admin email for login
 * @param {string} password - Admin password
 * @param {boolean} forceLogin - If true, forces re-login
 * @returns {Promise<{ browser: object, page: object } | null>}
 */
async function getAdminSession(forceLogin = false) {
    if (!forceLogin && fs.existsSync(SESSION_FILE)) {
        console.log("💾 Using existing session...");
        return reuseSession();
    }

    console.log("🔑 Logging in and saving session...");

    const browser = await chromium.launch({
        headless : true, // Set to true for production
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/530.19.2 (KHTML, like Gecko) Version/4.0.2 Safari/530.19.1",
        viewport: { width: 1440, height: 1080 },
        deviceScaleFactor: 1,
    });

    const page = await context.newPage();

    console.log("🔑 Navigating to login page...");
    await page.goto("https://employer.fastjobs.sg/site/login/", { waitUntil: "domcontentloaded" });

    // **Wait for the login form to be visible**
    await page.waitForSelector(".card-body form");

    // **Enter Credentials (Securely from .env)**
    const emailField = await page.locator(".input-content").nth(0);
    const passwordField = await page.locator(".input-content").nth(1);
    await emailField.fill(process.env.EMAIL);
    await passwordField.fill(process.env.PASS);
    console.log("✅ Credentials filled!");

    // **Click Login**
    await page.locator('fast-button:has-text("Login")').click();
    console.log("🚀 Login button clicked!");

    // **Verify login success**
    const response = await page.goto("https://employer.fastjobs.sg/p/my-activity/dashboard/", { timeout: 15000 });
    const loginSuccess = response && response.ok();
    if (!loginSuccess) {
        console.log("❌ Login failed! Please check credentials.");
        await browser.close();
        return null;
    }

    console.log("✅ Login successful! Redirected to dashboard.");

    // **Save session**
    const sessionData = await context.storageState();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData));
    console.log("💾 Session saved to file:", SESSION_FILE);

    return { browser, page };
}

/**
 * Reuses an existing Playwright session, and retries login if necessary.
 * @returns {Promise<{ browser: object, page: object } | null>}
 */
async function reuseSession() {
    if (!fs.existsSync(SESSION_FILE)) {
        console.log("❌ No saved session found. Attempting fresh login...");
        return await retryLogin();
    }

    let browser;
    try {
        browser = await chromium.launch({
            headless : true,
            args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"],
        });

        const context = await browser.newContext({
            storageState: SESSION_FILE, // Load stored session
            userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            viewport: { width: 1280, height: 720 },
            deviceScaleFactor: 1,
        });

        const page = await context.newPage();
        console.log("✅ Reusing authenticated session...");

        // **Verify session by checking if the dashboard loads**
        await page.goto("https://employer.fastjobs.sg/p/my-activity/dashboard/", { waitUntil: "domcontentloaded" });

        if (page.url().includes("login")) {
            throw new Error("Session expired. Redirected to login page.");
        }

        return { browser, page };

    } catch (error) {
        console.log(`⚠️ Session error: ${error.message}. Retrying login...`);

        // **Ensure browser closes before retrying login**
        if (browser) {
            await browser.close();
            console.log("🔴 Closed previous browser instance before retrying login.");
        }

        // **If session file is corrupted, delete it**
        if (error.message.includes("Error reading storage state")) {
            console.log("⚠️ Corrupt session file detected. Deleting and forcing a new login...");
            fs.unlinkSync(SESSION_FILE);
        }

        return await retryLogin();
    }
}
/**
 * Retries login once and returns a new session.
 * @returns {Promise<{ browser: object, page: object } | null>}
 */
/**
 * Retries login once and returns a new session.
 * @returns {Promise<{ browser: object, page: object } | null>}
 */
async function retryLogin() {
    console.log("🔄 Retrying login...");

    const session = await getAdminSession(true); // Force login
    if (!session) {
        console.log("❌ Login failed on retry. Cleaning up and exiting...");
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Small delay
        process.exit(1); // Exit with error status
    }

    console.log("✅ Successfully logged in and saved new session.");
    return session;
}


module.exports= {getAdminSession};