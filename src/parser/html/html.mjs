import { Parser } from "../parser.mjs";
import { log as l } from "../../log/log.mjs";
import {
  parseDataWithSelector,
  parseDataWithZipJoinList,
  parseDataWithZip,
  parseDataWithJoin,
  getNextPages
} from "./helper.mjs";
import Crawler from "crawler";
import { userAgent, getUrl } from "../helper.mjs";

const defaultCb = ({ instance, parg, domain, uri, resolve, reject }) => (
  error,
  res,
  done
) => {
  const $ = res.$;
  let output = {
    yield: null,
    nextPages: []
  };

  if (error || !$) {
    const err = `[HTML] Error parsing website: ${error}.`;
    instance.log("ERROR", err);
    reject(err);
  } else if (instance.config.pages && Array.isArray(instance.config.pages)) {
    // Return an array of array of items
    let result = instance.config.pages;

    if (parg) {
      result = result.filter(v => v.name === parg);
    }

    result = result.map(page => {
      // Parse data
      let out = parseDataWithSelector(
        $,
        domain,
        page.data.filter(e => !!e.selector),
        instance.log
      );

      // zip join list
      out = parseDataWithZipJoinList(out, page.data.filter(e => !!e.join));

      // zip array of selectors
      out = parseDataWithZip(out);

      // Adjust the "Join" case
      out = parseDataWithJoin(out, page.data.filter(e => !!e.join));

      // Set pageUrl
      out.map(element => {
        element["pageUrl"] = uri.href;
        return element;
      });

      // Add next pages
      output.nextPages = output.nextPages.concat(
        getNextPages($, uri, page.nextPages)
      );

      return out;
    });

    instance.log(
      "INFO",
      `[HTML] Completing parsing ${result.length} page(s)...`
    );
    output.yield = result;
  }

  output.nextPages = output.nextPages.length === 0 ? null : output.nextPages;

  done();
  resolve(output);
};

class Html extends Parser {
  constructor(config, args) {
    super();
    this.args = args;
    this.config = config;
  }

  async init() {
    this.log = l(this.args.log);
    this.parser = new Crawler({
      maxConnections: 20,
      userAgent: userAgent(false),
      rotateUA: true,
      jQuery: "cheerio",
      retries: 100,
      retryTimeout: 1000,
      timeout: 30000,
      ...this.config.parserOptions
    });
  }

  async close() {}

  async reader(parg, urls) {
    if (!urls) return;

    let uris;

    if (Array.isArray(urls)) {
      uris = urls.map(url =>
        getUrl(this.config.domain, url.url || this.config.rootUrl)
      );
    } else {
      uris = [getUrl(this.config.domain, urls.url || this.config.rootUrl)];
    }

    this.log("VERBOSE", `[HTML] Parsing website(s) ${uris}...`);

    return await Promise.all(
      uris.map(
        uri =>
          new Promise((resolve, reject) => {
            this.parser.queue({
              uri: uri,
              callback: defaultCb({
                instance: this,
                parg,
                domain: this.config.domain,
                uri: new URL(uri),
                resolve,
                reject
              })
            });
          })
      )
    );
  }
}

export { Html };
