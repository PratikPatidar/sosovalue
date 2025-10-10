const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const { HttpsProxyAgent } = require("https-proxy-agent");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config.js");
const { sleep, loadData, getRandomNumber, saveToken, isTokenExpired, saveJson, getRandomElement } = require("./utils/utils.js");
const { checkBaseUrl } = require("./utils/checkAPI.js");
const { headers } = require("./core/header.js");
const { showBanner } = require("./core/banner.js");
const localStorage = require("./localStorage.json");
const ethers = require("ethers");
const { solveCaptcha } = require("./utils/captcha.js");
const { TaskService } = require("./services/task.js");
const { SocialService } = require("./services/social.js");
const twiterTokens = loadData("twitter_tokens.txt");
const discordTokens = loadData("discord_tokens.txt");
const { PromisePool } = require("@supercharge/promise-pool");
const { jwtDecode } = require("jwt-decode");
const { PostService } = require("./services/post.js");
const initData = loadData("refreshToken.txt");

class ClientAPI {
  constructor(itemData, accountIndex, proxy) {
    this.headers = headers;
    this.baseURL = settings.BASE_URL;
    this.baseURL_v2 = settings.BASE_URL_v2;
    this.localItem = null;
    this.itemData = itemData;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.token = null;
    this.localStorage = localStorage;
    this.provider = null;
    this.wallet = null;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  #set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  createUserAgent() {
    try {
      this.session_name = this.itemData.key;
      this.#get_user_agent();
    } catch (error) {
      this.log(`Can't create user agent: ${error.message}`, "error");
      return;
    }
  }

  async log(msg, type = "info") {
    const accountPrefix = `[SOSOVALUE][${this.accountIndex + 1}][${this.itemData.key}]`;
    let ipPrefix = "[Local IP]";
    if (settings.USE_PROXY) {
      ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    }
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        return response.data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }

  async makeRequest(
    url,
    method,
    data = {},
    options = {
      retries: 2,
      isAuth: false,
      extraHeaders: {},
      refreshToken: null,
    }
  ) {
    const { retries = 2, isAuth = false, extraHeaders = {}, refreshToken } = options;

    const headers = {
      ...this.headers,
      ...extraHeaders,
    };

    if (!isAuth && this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
      headers["cookie"] = `refreshToken=${this.localItem?.refreshToken}`;
    }

    let proxyAgent = null;
    if (settings.USE_PROXY) {
      proxyAgent = new HttpsProxyAgent(this.proxy);
    }

    let currRetries = 0,
      errorMessage = "",
      errorStatus = 0;

    do {
      try {
        const response = await axios({
          method,
          url: `${url}`,
          headers,
          timeout: 120000,
          ...(proxyAgent ? { httpsAgent: proxyAgent, httpAgent: proxyAgent } : {}),
          ...(method.toLowerCase() !== "get" ? { data: data } : {}),
        });
        if (response?.data?.data) return { status: response.status, success: true, data: response.data.data };
        return { success: true, data: response.data, status: response.status };
      } catch (error) {
        errorMessage = error?.response?.data?.error || error.message;
        errorStatus = error.status;
        this.log(`Request failed: ${url} | ${JSON.stringify(errorMessage)}...`, "warning");

        if (error.status === 401) {
          if (!url.includes("refreshAuthInfo")) {
            const token = await this.getValidToken(true);
            if (!token) {
              return { success: false, data: null, error: "UnAuth", status: 401 };
            }
            this.token = token;
            return this.makeRequest(url, method, data, {
              ...options,
              retries: retries - 1,
            });
          }
          return { success: false, status: error.status, error: errorMessage, data: null };
        }
        if (error.status === 400) {
          this.log(`Invalid request for ${url}, maybe have new update from server | contact: https://t.me/airdrophuntersieutoc to get new update!`, "error");
          return { success: false, status: error.status, error: errorMessage, data: null };
        }
        if (error.status === 429) {
          await sleep(60);
        }
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        currRetries++;
        if (currRetries > retries) {
          return { status: error.status, success: false, error: errorMessage, data: null };
        }
      }
      await sleep(5);
    } while (currRetries <= retries);

    return { status: errorStatus, success: false, error: errorMessage, data: null };
  }

  getCookieData(setCookie) {
    try {
      if (!(setCookie?.length > 0)) return null;
      let cookie = [];
      const item = JSON.stringify(setCookie);
      const nonceMatch = item.match(/refreshToken=([^;]+)/);
      if (nonceMatch && nonceMatch[0]) {
        cookie.push(nonceMatch[0]);
      }

      const data = cookie.join(";");
      return cookie.length > 0 ? data : null;
    } catch (error) {
      return null;
    }
  }

  async auth() {
    let refreshToken = this.localItem?.refreshToken;
    if (!refreshToken && !this.itemData?.refreshToken) {
      this.log(`No found refresh token`, "warning");
      await sleep(1);
      process.exit(1);
    } else if (!refreshToken && this.itemData.refreshToken) {
      try {
        const payload = jwtDecode(this.itemData.refreshToken);
        const { token_type, exp } = payload;
        if (token_type !== "refresh_token") {
          this.log(`Invalid refresh token`, "warning");
          return null;
        }
        if (exp < Date.now() / 1000) {
          this.log(`Refresh token expried, please get manually`, "warning");
          return null;
        }
        refreshToken = this.itemData?.refreshToken;
      } catch (error) {}
    }

    return this.makeRequest(
      `${settings.BASE_URL}/usercenter/user/anno/refreshAuthInfo`,
      "post",
      {},
      {
        isAuth: true,
        extraHeaders: {
          cookie: `refreshToken=${refreshToken}`,
        },
      }
    );
  }

  async getUserInfo() {
    return this.makeRequest(`${settings.BASE_URL}/authentication/user/getUserInfo`, "get");
  }

  async getBalance() {
    return this.makeRequest(`${settings.BASE_URL}/rights/equity/rab-exp-info/getUserExe`, "get");
  }

  async getValidToken(isNew) {
    const existingToken = this.token;
    const { isExpired: isExp, expirationDate } = isTokenExpired(existingToken);

    this.log(`Access token status: ${isExp ? "Expired".yellow : "Valid".green} | Acess token exp: ${expirationDate}`);
    if (existingToken && !isNew && !isExp) {
      this.log("Using valid token", "success");
      return existingToken;
    }

    this.log("No found token or experied, trying get new token...", "warning");

    const loginRes = await this.auth();
    if (!loginRes?.success) {
      this.log(`Auth failed: ${JSON.stringify(loginRes)}`, "error");
      return null;
    }
    const newToken = loginRes.data;
    if (newToken?.token) {
      initData[this.accountIndex] = newToken?.refreshToken || this.localItem?.refreshToken;
      await saveJson(this.session_name, JSON.stringify(newToken), "localStorage.json");
      return newToken.token;
    }
    this.log("Can't get new token...", "warning");
    return null;
  }

  async handleSyncData() {
    this.log(`Sync data...`);
    let [userData, balanceData] = await Promise.all([this.getUserInfo(), this.getBalance()]);
    if (userData?.success) {
      const { invitationCode, email, userThirdRelationVOS } = userData.data;
      const { currentExp, level, firstSeasonExpSnapshot, isAuth } = balanceData.data;
      const messInfo = userThirdRelationVOS?.length > 0 ? userThirdRelationVOS.map((i) => i.username).join(" | ") : "";
      this.log(`${messInfo} | Invite code: ${invitationCode}  | Exp ss2: ${currentExp - firstSeasonExpSnapshot} | Verify: ${isAuth > 0}`, "custom");
    } else {
      this.log("Can't sync new data...skipping", "warning");
    }
    return userData;
  }

  async handleTask() {
    this.log(`Checking task ...`);
    const sv = new TaskService({
      wallet: this.wallet,
      token: this.token,
      provider: this.provider,
      makeRequest: (url, method, data, options) => this.makeRequest(url, method, data, options),
      log: (ms, type) => this.log(ms, type),
    });
    await sv.handleTask();
  }

  async handlePost() {
    this.log(`Posting task ...`);
    const sv = new PostService({
      wallet: this.wallet,
      provider: this.provider,
      makeRequest: (url, method, data, options) => this.makeRequest(url, method, data, options),
      log: (ms, type) => this.log(ms, type),
    });
    await sv.handlePost();
  }

  async handleSocial() {
    this.log(`Social task ...`);
    const sv = new SocialService({
      wallet: this.wallet,
      provider: this.provider,
      makeRequest: (url, method, data, options) => this.makeRequest(url, method, data, options),
      log: (ms, type) => this.log(ms, type),
      twitterToken: twiterTokens[this.accountIndex] || null,
      discordToken: discordTokens[this.accountIndex] || null,
    });
    await sv.handleConect();
  }

  async connectRPC() {
    // this.provider = new ethers.JsonRpcProvider(settings.RPC_URL, {
    //   fetch: (url, options) => {
    //     if (settings.USE_PROXY) options.agent = new HttpsProxyAgent(this.proxy);
    //     return fetch(url, options);
    //   },
    //   chainId: Number(settings.CHAIN_ID),
    //   name: "ETH",
    // });
    // this.wallet = new ethers.Wallet(this.itemData.privateKey, this.provider);
  }

  async runAccount() {
    const accountIndex = this.accountIndex;
    this.session_name = this.itemData.key;
    this.localItem = JSON.parse(this.localStorage[this.session_name] || "{}");
    this.token = this.localItem?.token;
    this.#set_headers();
    if (settings.USE_PROXY) {
      try {
        this.proxyIP = await this.checkProxyIP();
      } catch (error) {
        this.log(`Cannot check proxy IP: ${error.message}`, "error");
        return;
      }
    }
    const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
    console.log(`=========Tài khoản ${accountIndex + 1} | ${this.proxyIP || "Local IP"} | Bắt đầu sau ${timesleep} giây...`.green);
    await sleep(timesleep);

    const token = await this.getValidToken();
    if (!token) return;
    this.token = token;
    const userData = await this.handleSyncData();
    if (userData?.success) {
      await this.handleTask();
      await sleep(1);
      await this.handlePost();
      // await this.handleSocial();
    } else {
      return this.log("Can't get use info...skipping", "error");
    }
  }
}

async function main() {
  console.clear();
  showBanner();
  const proxies = loadData("proxy.txt");
  let newRefreshTokens = initData;

  if (initData.length == 0 || (initData.length > proxies.length && settings.USE_PROXY)) {
    console.log("Số lượng proxy và data phải bằng nhau.".red);
    console.log(`Data: ${initData.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  if (!settings.USE_PROXY) {
    console.log(`You are running bot without proxies!!!`.yellow);
  }
  let maxThreads = settings.USE_PROXY ? settings.MAX_THEADS : settings.MAX_THEADS_NO_PROXY;

  const resCheck = await checkBaseUrl();
  if (!resCheck.endpoint) return console.log(`Không thể tìm thấy ID API, có thể lỗi kết nỗi, thử lại sau!`.red);
  console.log(`${resCheck.message}`.yellow);

  console.log(`Initing data...`.blue);
  const data = initData.map((val, index) => {
    const payload = jwtDecode(val);
    // const prvk = val.startsWith("0x") ? val : `0x${val}`;
    // const wallet = new ethers.Wallet(prvk);
    const item = {
      refreshToken: val,
      ...payload,
      key: payload.userId,
    };
    new ClientAPI(item, index, proxies[index]).createUserAgent();
    return item;
  });

  await sleep(1);
  while (true) {
    const { results, errors } = await PromisePool.withConcurrency(settings.MAX_THEADS)
      .for(data)
      .process(async (itemData, index, pool) => {
        const to = new ClientAPI(itemData, index, proxies[index % proxies.length]);
        try {
          await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
        } catch (error) {
          console.log("err", error.message);
        } finally {
        }
      });

    try {
      const filePath = path.join(process.cwd(), "data", "refreshToken.txt");
      const newDataRefreshTokens = "\n" + initData.join("\n");
      fs.writeFile(filePath, newDataRefreshTokens, (err) => {});
    } catch (error) {}

    await sleep(5);
    console.log(`=============${new Date().toLocaleString()} | Hoàn thành tất cả tài khoản | Chờ ${settings.TIME_SLEEP} phút=============`.magenta);
    showBanner();
    await sleep(settings.TIME_SLEEP * 60);
  }
}

main()
  .catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  })
  .finally(() => {});
