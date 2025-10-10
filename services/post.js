const settings = require("../config/config");
const { sleep, getRandomNumber, getRandomElement, loadData } = require("../utils/utils");
const comments = loadData(`comments.txt`);

class PostService {
  constructor({ wallet, provider, log, makeRequest }) {
    this.wallet = wallet;
    this.provider = provider;
    this.log = log;
    this.makeRequest = makeRequest;
    this.userData = null;
  }

  async getUserInfo() {
    const res = await this.makeRequest(`${settings.BASE_URL}/authentication/user/getUserInfo`, "get");
    this.userData = res?.data;
    return res;
  }

  async getListPost() {
    return this.makeRequest(`${settings.BASE_URL}/bar/token-bar/posts/anno/feed/v3`, "post", {
      language: "en",
      pageNum: 3,
      pageSize: 50,
      notIncludeIds: [],
    });
  }

  async getAllCommentpost(postId) {
    return this.makeRequest(`${settings.BASE_URL}/bar/token-bar-comment/findListPage`, "post", {
      pageNum: 1,
      pageSize: 10,
      postIdList: [postId],
      commentLevel: 1,
    });
  }

  async creatPost(payload) {
    // {
    //   "language": "en",
    //   "barId": "1839139826975059969",
    //   "title": "GM",
    //   "content": "<div class=\"bn-block-group\" data-node-type=\"blockGroup\"><div class=\"bn-block-outer\" data-node-type=\"blockOuter\" data-id=\"5c96894b-954e-4375-9f0a-1e0f4a61bd67\"><div class=\"bn-block\" data-node-type=\"blockContainer\" data-id=\"5c96894b-954e-4375-9f0a-1e0f4a61bd67\"><div class=\"bn-block-content\" data-content-type=\"paragraph\"><p class=\"bn-inline-content\">GM</p></div></div></div><div class=\"bn-block-outer\" data-node-type=\"blockOuter\" data-id=\"42cc6c44-e957-48f8-92fa-eaa7ef29ac24\"><div class=\"bn-block\" data-node-type=\"blockContainer\" data-id=\"42cc6c44-e957-48f8-92fa-eaa7ef29ac24\"><div class=\"bn-block-content\" data-content-type=\"paragraph\"><p class=\"bn-inline-content\"></p></div></div></div></div>"
    // }
    return this.makeRequest(`${settings.BASE_URL}/bar/token-bar/posts/create`, "post", payload);
  }

  async likePost(payload) {
    return this.makeRequest(`${settings.BASE_URL}/bar/token-bar/posts/like`, "post", payload);
  }

  async getChache(payload) {
    return this.makeRequest(`${settings.BASE_URL}/bar/token-bar-my-page/getUserCacheListVO`, "get");
  }

  async commentPost(payload) {
    return this.makeRequest(`${settings.BASE_URL}/bar/token-bar-comment/create`, "post", payload);
  }

  async handlePost() {
    await this.getUserInfo();
    const resList = await this.getListPost();
    if (!resList?.data?.list) return;
    const totalPost = resList?.data?.list;
    const randomPost = getRandomElement(totalPost);
    const { id, bardId } = randomPost;
    const resLike = await this.likePost({ id, bardId });
    if (resLike.success) {
      this.log(`Liked post ${id} success`, "success");
    }
    const resAllComment = await this.getAllCommentpost(id);

    if (resAllComment?.data?.list?.[0]) {
      const { replyId } = resAllComment?.data?.list?.[0];
      const message = getRandomElement(comments);
      if (message) {
        const resComent = await this.commentPost({
          barId: bardId,
          postId: id,
          content: `<div class="bn-block-group" data-node-type="blockGroup"><div class="bn-block-outer" data-node-type="blockOuter" data-id="23cd13dd-57c8-4e6c-a65a-a0207fa28c78"><div class="bn-block" data-node-type="blockContainer" data-id="23cd13dd-57c8-4e6c-a65a-a0207fa28c78"><div class="bn-block-content" data-content-type="paragraph"><p class="bn-inline-content">${message}</p></div></div></div><div class="bn-block-outer" data-node-type="blockOuter" data-id="ebe438e3-0dea-40a7-943b-4eef9545e355"><div class="bn-block" data-node-type="blockContainer" data-id="ebe438e3-0dea-40a7-943b-4eef9545e355"><div class="bn-block-content" data-content-type="paragraph"><p class="bn-inline-content"></p></div></div></div></div>`,
          commentLevel: 1,
          replyId: replyId,
          language: "en",
        });
        if (resComent.success) {
          this.log(`Comment post ${id} success`, "success");
        }
      }
    }
  }
}

module.exports = { PostService };
