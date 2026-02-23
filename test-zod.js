const { z } = require('zod');

const schema = z.object({
    uid: z.string().catch("fallback_uid"),
    title: z.string().catch("fallback_title"),
    legacy: z.string().optional().default("fallback_legacy"),
    safe: z.string().optional().catch("fallback_safe"),
});

try {
    console.log(schema.parse({}));
} catch (e) {
    console.log("Error!", JSON.stringify(e.errors, null, 2));
}
