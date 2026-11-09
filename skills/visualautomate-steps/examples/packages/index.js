const _ = require("lodash");
const { format } = require("date-fns");
const { z } = require("zod");

const Order = z.object({ id: z.string(), total: z.number(), createdAt: z.string() });

/** @type {PluginModule} */
module.exports = {
  execute: async (input) => {
    const parsed = z.array(Order).safeParse(input.orders ?? []);
    if (!parsed.success) {
      return { output: "error", data: { reason: parsed.error.issues.map((i) => i.message) } };
    }

    const byDay = _.mapValues(
      _.groupBy(parsed.data, (o) => format(new Date(o.createdAt), "yyyy-MM-dd")),
      (orders) => _.sumBy(orders, "total"),
    );
    return { output: "success", data: { byDay } };
  },
};
