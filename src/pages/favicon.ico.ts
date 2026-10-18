import type { APIRoute } from 'astro';

/** Browsers request /favicon.ico regardless of <link rel="icon">; point them to the SVG icon. */
export const GET: APIRoute = ({ redirect }) => redirect('/favicon.svg', 301);
