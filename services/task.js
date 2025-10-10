const settings = require("../config/config");
const { sleep, getRandomNumber } = require("../utils/utils");
const WebSocket = require("ws");

class TaskService {
  constructor({ wallet, provider, log, makeRequest, token }) {
    this.wallet = wallet;
    this.provider = provider;
    this.log = log;
    this.makeRequest = makeRequest;
    this.userData = null;
    this.token = token;
  }

  async getUserInfo() {
    const res = await this.makeRequest(`${settings.BASE_URL}/authentication/user/getUserInfo`, "get");
    this.userData = res?.data;
    return res;
  }

  async checkin() {
    await this.fixedTask();
    const resAcc = await this.creatAction();
    const res = await this.makeRequest(`${settings.BASE_URL}/rights/daily-checkin-do/findPage`, "post", {
      pageSize: 1,
      userId: this.userData.id,
    });
    if (res?.data?.list) {
      const info = res?.data?.list[0];
      this.log(`Streak checkin: ${info.consecutiveDays}`, "custom");
    }
  }
  async pushSocket() {
    const wsUrl = `wss://pushws.sosovalue.com/ws?token=Bearer%20${this.token}`;
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          resolve(ws);
        };

        ws.onerror = (error) => {
          reject(error);
        };

        ws.onclose = (event) => {};

        ws.onmessage = (event) => {};
      } catch (error) {
        this.log(`Error initializing WebSocket: ${error.message}`, "warning");
        reject(error);
      }
    });
  }

  async creatAction() {
    return this.makeRequest(`${settings.BASE_URL}/data/s-user-action-log-do/create`, "post", {
      actionClassify: 1,
      actionId: 1,
      createTime: Date.now(),
      module: 1,
      spendTime: getRandomNumber(100, 1000),
      userBrowser: "Edge",
      userDevice: "Windows",
      userId: this.userData.id,
      userName: this.userData.username,
    });
  }

  async fixedTask() {
    return this.makeRequest(`${settings.BASE_URL}/task/fixed-task-progress-do/querySettleTaskStatus`, "post", {});
  }

  async getTasks() {
    return this.makeRequest(`${settings.BASE_URL}/task/task-config-do/v1/queryTaskList`, "post", {
      activityType: 0,
      deviceType: 1,
    });
  }

  async checkTaskTg(payload) {
    // {
    //     "taskKey": "Join_Spacecoin_KOL_TG",
    //     "tgUserId": "xxx",
    //     "botName": ""
    // }

    return this.makeRequest(`${settings.BASE_URL}/task/user/task/verify/tg/channel/join/check`, "post", payload);
  }

  async checkTaskTw(payload) {
    // {
    //     "taskKey": "Follow_Spacecoin_Creditcoin_X",
    //     "twitterUserId": "xxx"
    // }
    //   task/user/task/verify/twiter/comment/check
    //   task/user/task/verify/twiter/follow/check
    return this.makeRequest(`${settings.BASE_URL}/task/user/task/verify/twiter/follow/check`, "post", payload);
  }

  async doTaskDaily(taskKey) {
    return this.makeRequest(`${settings.BASE_URL}/task/task/support/daily/other/complete/0/${taskKey}`, "post");
  }

  async checkJumTask(payload) {
    return this.makeRequest(`${settings.BASE_URL}/task/task/support/checkJumpLink`, "post", payload);
  }

  flattenAndAddKey(obj) {
    const result = [];
    for (const key in obj) {
      if (Array.isArray(obj[key])) {
        obj[key].forEach((value) => {
          result.push({ ...value, key: key });
        });
      }
    }

    return result;
  }

  async handleTask() {
    this.pushSocket();
    await this.getUserInfo();
    await this.checkin();
    const resTasks = await this.getTasks();
    if (!resTasks.success) return;
    const dataFlat = this.flattenAndAddKey(resTasks?.data);
    const tasksAvailable = dataFlat.filter((t) => !settings.SKIP_TASKS.includes(t.taskKey) && t.completedCount < t.completionLimit && (!t.taskExpirationTime || Date.now() < t.taskExpirationTime));

    const tk = tasksAvailable.map((t) => t.taskKey);

    if (tasksAvailable.length == 0) return this.log(`No task available`, "warning");
    for (const task of tasksAvailable) {
      const timeSleep = getRandomNumber(30, 60);
      await sleep(5);
      const { id, taskType, taskKey, taskDelayTime, taskExpirationTime, key } = task;

      this.log(`Compeleting task ${taskKey} (${id}) | Waiting ${timeSleep}s to verify task...`);
      await sleep(timeSleep);
      if (taskDelayTime) {
        this.log(`Waiting ${60}s to verify task...`);
        await sleep(60);
      }
      let resCom = null;
      if (taskKey.includes("DAILY")) {
        resCom = await this.doTaskDaily(taskKey);
      } else {
        resCom = await this.checkJumTask({
          activityType: taskType,
          taskId: id,
        });
      }
      if (resCom.success) {
        this.log(`Compeleted task ${taskKey} (${id}) success`, "success");
      } else {
        this.log(`Compeleted task ${taskKey} (${id}) failed | ${JSON.stringify(resCom)}`, "warning");
      }
    }
  }
}

module.exports = { TaskService };
