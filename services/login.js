const { ethers } = require("ethers");
const puppeteer = require("puppeteer");
const { saveJson } = require("../utils/utils");

class LoginService {
  constructor({ wallet, provider, log, makeRequest, localItem }) {
    this.wallet = wallet;
    this.provider = provider;
    this.log = log;
    this.makeRequest = makeRequest;
    this.localItem = localItem;
  }

  async handleRefresToken() {
    const res = this.makeRequest(
      `${settings.BASE_URL}/usercenter/user/anno/refreshAuthInfo`,
      "post",
      {},
      {
        extraHeaders: {
          "old-info": `Bearer ${this.localItem.token}`,
          cookie: `refreshToken=${this.localItem.refreshToken}`,
        },
      }
    );
  }

  async handleLogin() {
    const browser = await puppeteer.launch({
      headless: false, // Đặt true để chạy ngầm
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-web-security",
        // "--load-extension=/path/to/okx-wallet-extension", // Đường dẫn đến folder extension unpacked (tải từ Chrome store, unzip)
        // "--disable-extensions-except=/path/to/okx-wallet-extension",
      ], // Bỏ qua CORS nếu cần
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // Config: Thay bằng giá trị thật
    const TWOCAPTCHA_API_KEY = "YOUR_2CAPTCHA_API_KEY"; // Từ dashboard 2captcha
    const EMAIL = "your_email@example.com";
    const PASSWORD = "xxx";
    const LOGIN_URL = "https://sosovalue.com/";
    const TOKEN_KEY = "token";
    const PRIVATE_KEY = "xxx";

    try {
      // Bước 1: Truy cập trang
      await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });
      console.log("Đã load trang");

      // Bước 2: Mở OKX Wallet extension để import private key
      // Click icon extension (giả sử ở vị trí fixed, adjust selector nếu cần)
      const extensionUrl = "chrome-extension://mcohilncbfahbmgdjkbpemcciiolgcge/notification.html#/";
      await page.goto(extensionUrl);

      // Trong popup: Chọn "Import wallet" > "Private key"
      await page.waitForSelector('[data-testid="import-wallet-button"], button:has-text("Import")', { timeout: 10000 });
      await page.click('[data-testid="import-wallet-button"], button:has-text("Import")');

      await page.waitForSelector('input[type="radio"][value="private-key"], #private-key-option', { timeout: 5000 });
      await page.click('input[type="radio"][value="private-key"], #private-key-option');

      await page.waitForSelector('textarea[name="private-key"], input[name="privateKey"]', { timeout: 5000 });
      await page.type('textarea[name="private-key"], input[name="privateKey"]', PRIVATE_KEY);

      // Set password nếu yêu cầu (giả sử không cần cho import)
      await page.type("#password", PASSWORD);

      await page.click('button[type="submit"], #confirm-import');
      await page.waitForTimeout(3000); // Đợi import hoàn tất

      // Verify: Kiểm tra address hiển thị
      const importedAddress = await page.evaluate(() => document.querySelector(".wallet-address, #account-address")?.textContent);
      if (importedAddress !== address) {
        throw new Error("Import private key thất bại!");
      }
      console.log("Import OKX Wallet thành công với address:", importedAddress);

      // Bước 3: Quay lại trang SoSoValue và connect wallet
      await page.goBack(); // Hoặc page.goto(LOGIN_URL) nếu cần
      await page.waitForTimeout(2000);

      // Click "Connect Wallet" button
      const connectSelector = '.connect-wallet, #connect-wallet, button:has-text("Connect")';
      await page.waitForSelector(connectSelector, { timeout: 10000 });
      await page.click(connectSelector);

      // Chọn OKX Wallet trong modal (giả sử list wallets)
      const okxSelector = 'button:has-text("OKX"), .wallet-option:has([src*="okx"])';
      await page.waitForSelector(okxSelector, { timeout: 5000 });
      await page.click(okxSelector);

      // Nếu có popup confirm connect từ extension, switch context hoặc evaluate để approve
      // (Puppeteer có thể cần handle target changed)
      page.on("targetcreated", async (target) => {
        const newPage = await target.page();
        if (newPage.url().includes("okx") || newPage.url().includes("extension")) {
          await newPage.waitForSelector('button:has-text("Approve"), #connect-confirm', { timeout: 5000 });
          await newPage.click('button:has-text("Approve"), #connect-confirm');
          console.log("Đã approve connect");
        }
      });

      // Đợi connect thành công (wait for signature nếu cần, hoặc element user profile)
      await page.waitForSelector('.wallet-connected, .user-address, [data-testid="connected-wallet"]', { timeout: 15000 });

      // Nếu cần sign message (thường cho auth), handle qua evaluate với ethers
      // Giả sử trang gọi ethereum.request({ method: 'personal_sign' })
      // Bạn có thể mock provider nếu cần, nhưng ở đây assume auto-sign vì headless false

      // Bước 4: Xử lý CAPTCHA nếu vẫn xuất hiện (ít xảy ra với Web3)
      // const captchaSelector = '.cf-turnstile';
      // if (await page.$(captchaSelector)) {
      //   const siteKey = await page.$eval(captchaSelector, el => el.getAttribute('data-sitekey'));
      //   await solveTurnstileCaptcha(page, TWOCAPTCHA_API_KEY, siteKey, page.url());
      // }

      this.log("Login success!", "success");
      const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
      if (!token) {
        this.log(`No found token`, "warning");
        return null;
      } else {
        // await saveJson(this.wallet.address, JSON.stringify(token), "localStorage.json");
        return JSON.parse(JSON.stringify(token))?.value || null;
      }
    } catch (error) {
      console.error("Lỗi:", error.message);
      return null;
    } finally {
      await browser.close();
    }
  }

  async loginByWeb3() {}

  async loginByEmail() {}
}

module.exports = LoginService;
