import collect from 'collect.js';
import pkg from '@atproto/api';
const { BskyAgent, AppBskyFeedPost, RichText } = pkg;
import cheerio from "cheerio";
import sharp from "sharp";
import Parser from "rss-parser";
const parser = new Parser({defaultRSS: 2});

const settings = [
  {
    account: process.env.BSKY_HANDLE,
    password: process.env.BSKY_PASSWORD,
    url: "https://www.ncaa.com/news/gymnastics-women/nc/rss.xml#",
  },
];

async function get_feeds(url) {
	//console.log("Entering get_feeds function for " + url);
  const feed = await parser.parseURL(url);
  let output = [];
  let ordered = collect(feed.items);
  ordered = ordered.reverse();
  for (const item of ordered) {
  	//console.log("Title: " + item.title);
    //console.log("Link: " + item.link);
    output.push({
      title: item.title,
      link: item.link,
    });
  }
  //console.log("Done with get_feeds!");
  return output;
}

async function post(agent, item) {
	//console.log("Entered post function");
	const text =  item.title + "\n\n #NCAAGym #GymSky #Gymternet #Gymnastics";
	const richText = new RichText({text});
	await richText.detectFacets(agent);
  let post = {
    $type: "app.bsky.feed.post",
    text: richText.text,
    facets: richText.facets,
    createdAt: new Date().toISOString(),
  };
  const dom = await fetch(item.link)
    .then((response) => response.text())
    .then((html) => cheerio.load(html));

  let description = null;
  const description_ = dom('head > meta[property="og:description"]');
  if (description_) {
    description = description_.attr("content");
  }

  let image_url = null;
  const image_url_ = dom('head > meta[property="og:image"]');
  if (image_url_) {
    image_url = image_url_.attr("content");
  }
  const buffer = await fetch(image_url)
    .then((response) => response.arrayBuffer())
    .then((buffer) => sharp(buffer))
    .then((s) =>
      s.resize(
        s
          .resize(800, null, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({
            quality: 80,
            progressive: true,
          })
          .toBuffer()
      )
    );
  const image = await agent.uploadBlob(buffer, { encoding: "image/jpeg" });
  post["embed"] = {
    external: {
      uri: item.link,
      title: item.title,
      description: description,
      thumb: image.data.blob,
    },
    $type: "app.bsky.embed.external",
  };
  const res = AppBskyFeedPost.validateRecord(post);
  if (res.success) {
    //console.log(post);
    await agent.post(post);
  } else {
    console.log(res.error);
  }
}

async function main(setting) {
	//console.log("Entering main");
  const agent = new BskyAgent({ service: "https://bsky.social" });
  await agent.login({
    identifier: setting.account,
    password: setting.password,
  });

  let processed = new Set();
  let cursor = "";
  const response = await agent.getAuthorFeed({
    actor: setting.account,
    limit: 100,
    cursor: cursor,
  });
  cursor = response.cursor;
  for (const feed of response.data.feed) {
  	//console.log(feed);
  	if(typeof feed.post.record.embed !== "undefined") {
  		processed.add(feed.post.record.embed.external.uri);
  	}
    processed.add(feed.post.record.text);
  }
  for (const feed of await get_feeds(setting.url)) {
    if (!processed.has(feed.title + "\n\n#NCAAGym") && !processed.has(feed.link)) {
      await post(agent, feed);
    } else {
      console.log("skipped " + feed.title);
    }
  }
}
async function entrypoint() {
  for (const setting of settings) {
    console.log("process " + setting.url);
    await main(setting);
  }
  console.log("--- finish ---");
}
entrypoint();
/*functions.cloudEvent("entrypoint", async (_) => {
  for (const setting of settings) {
    console.log("process " + setting.url);
    await main(setting);
  }
  console.log("--- finish ---");
});*/