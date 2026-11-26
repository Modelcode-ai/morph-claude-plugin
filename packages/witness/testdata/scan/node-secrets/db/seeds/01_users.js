exports.seed = async (knex) => {
  await knex("users").insert({ email: "owner@billing.test", role: "owner" });
};
