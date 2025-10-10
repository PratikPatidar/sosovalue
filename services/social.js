const settings = require("../config/config");
const { sleep, getRandomNumber } = require("../utils/utils");
const crypto = require("crypto");

class SocialService {
  constructor({ wallet, provider, log, makeRequest, twitterToken, discordToken }) {
    this.wallet = wallet;
    this.provider = provider;
    this.log = log;
    this.makeRequest = makeRequest;
    this.userId = null;
    this.twitterToken = twitterToken;
    this.discordToken = discordToken;
  }

  convertUrlPrams(url, params) {
    url = new URL(url);
    Object.keys(params).forEach((key) => url.searchParams.append(key, params[key]));
    return url.toString();
  }

  async connectTwitter() {
    try {
      if (!this.twitterToken) return this.log(`No found token twitter`, "warning");
      const generated_csrf_token = crypto.randomBytes(16).toString("hex");
      const cookies = { ct0: generated_csrf_token, auth_token: this.twitterToken };
      const cookies_headers = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");

      const headers = {
        cookie: cookies_headers,
        "x-csrf-token": generated_csrf_token,
        "upgrade-insecure-requests": "1",
        authorization: "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      };

      const client_id = "YW1nN2RHYmtEVV9odHNOSEZ2SEE6MTpjaQ";
      const code_challenge = "challenge";
      const state = "state";
      const params = {
        client_id: client_id,
        code_challenge: code_challenge,
        code_challenge_method: "plain",
        redirect_uri: "https://sosovalue.com/api/twitter-sign?redirectUri=https://sosovalue.com",
        response_type: "code",
        scope: "tweet.read users.read",
        state: state,
      };
      let response = await this.makeRequest(this.convertUrlPrams(`https://x.com/i/api/2/oauth2/authorize`, params), "get", null, {
        extraHeaders: {
          ...headers,
        },
      });

      console.log(response);

      const auth_code = response.data.auth_code;
      if (!auth_code) return this.log(`Can't connect twitter`, "warning");
      const data = {
        approval: "true",
        code: auth_code,
      };

      response = await this.makeRequest("https://x.com/i/api/2/oauth2/authorize", "post", data, {
        extraHeaders: {
          ...headers,
        },
      });

      const redirect_url = response.data.redirect_uri;
      console.log(headers);
      console.log({ redirect_url });

      return;
      //   headers = {
      //     accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      //     referer: "https://twitter.com/",
      //     priority: "u=0, i",
      //   };

      //   response = await this.makeRequest(redirect_url, "get", null, {
      //     extraHeaders: {
      //       ...headers,
      //     },
      //   });

      //   headers = {
      //     "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      //     "sec-ch-ua-mobile": "?0",
      //     "sec-ch-ua-platform": '"Windows"',
      //     "upgrade-insecure-requests": "1",
      //     "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      //     accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      //     "sec-fetch-site": "cross-site",
      //     "sec-fetch-mode": "navigate",
      //     "sec-fetch-user": "?1",
      //     "sec-fetch-dest": "document",
      //     referer: "https://x.com/",
      //     "accept-language": "en-US,en;q=0.9,ru;q=0.8,zh-TW;q=0.7,zh;q=0.6,uk;q=0.5",
      //     priority: "u=0, i",
      //   };

      //   // For curl_session, create a new axios instance with proxy and user-agent
      //   const curl_session = axios.create({
      //     headers: {
      //       "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", // Impersonate chrome131
      //     },
      //     proxy: {
      //       protocol: "http",
      //       host: this.kiteai.proxy.split(":")[0],
      //       port: parseInt(this.kiteai.proxy.split(":")[1]),
      //     },
      //     httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }), // verify=False
      //   });

      //   params = {
      //     state: "state",
      //     code: auth_code,
      //   };
      //   response = await curl_session.get("https://testnet.gokite.ai/twitter", { params, headers, maxRedirects: 0 });

      //   const location = response.headers.location;
      //   if (!location) {
      //     throw new Error(`Failed to connect twitter send auth_code: no location in response: ${response.status} | ${JSON.stringify(response.data)}`);
      //   }

      //   const location_token = location.split("token=")[1];

      //   response = await curl_session.get(location, { headers, maxRedirects: 0 });

      //   if (response.status !== 200) {
      //     throw new Error(`Failed to connect twitter send auth_code: status code is ${response.status} | ${JSON.stringify(response.data)}`);
      //   }

      //   await this.kiteai.login();

      //   const cookie = {
      //     user_session_id: this.kiteai.kiteai_login_token,
      //   };

      //   headers = {
      //     "sec-ch-ua-platform": '"Windows"',
      //     "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      //     "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      //     "sec-ch-ua-mobile": "?0",
      //     accept: "*/*",
      //     origin: "https://testnet.gokite.ai",
      //     "sec-fetch-site": "same-origin",
      //     "sec-fetch-mode": "cors",
      //     "sec-fetch-dest": "empty",
      //     referer: "https://testnet.gokite.ai/twitter",
      //     "accept-language": "en-US,en;q=0.9,ru;q=0.8,zh-TW;q=0.7,zh;q=0.6,uk;q=0.5",
      //     priority: "u=1, i",
      //   };

      //   params = {
      //     token: location_token,
      //   };

      //   response = await this.makeRequest("https://gw.sosovalue.com/usercenter/personal/bindThirdParty", "post", {
      //     oauthToken: "sj2S9wAAAAABpaBwAAABmY-Ul74",
      //     oauthVerifier: "zR9ohDixaTCeBNfzsfn2O3cwtd4fXi0M",
      //     thirdpartyName: "twitter",
      //   });

      //   if (response.data) {
      //     this.log(`Successfully connected twitter`, "success");
      //     return true;
      //   } else {
      //     this.log(`Failed to connect twitter: ${response.status} | ${JSON.stringify(response.data)}`, "warning");
      //   }
    } catch (error) {
      if (error.message.includes("Could not authenticate you")) {
        this.log(`Twitter token is invalid`, "error");
        return false;
      } else {
        this.log(`Twitter connect failed | ${error.message}`, "warning");
      }
    }
  }

  async handleConect() {
    await this.connectTwitter();
  }
}

module.exports = { SocialService };
