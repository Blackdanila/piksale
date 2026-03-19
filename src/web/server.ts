import { Hono } from "hono";
import { apiRoutes } from "./api/routes.js";
import { homePage } from "./pages/home.js";
import { blocksPage } from "./pages/blocks.js";
import { blockDetailPage } from "./pages/block-detail.js";
import { flatDetailPage } from "./pages/flat-detail.js";
import { dynamicsPage } from "./pages/dynamics.js";

export function createWebApp() {
  const app = new Hono();

  // API routes
  app.route("/api/v1", apiRoutes);

  // Pages
  app.get("/", async (c) => {
    const html = await homePage();
    return c.html(html);
  });

  app.get("/blocks", async (c) => {
    const locationId = c.req.query("location");
    const page = parseInt(c.req.query("page") ?? "1", 10);
    const html = await blocksPage(
      locationId ? parseInt(locationId, 10) : undefined,
      page,
    );
    return c.html(html);
  });

  app.get("/blocks/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const rooms = c.req.query("rooms");
    const sort = c.req.query("sort") ?? "price_asc";
    const page = parseInt(c.req.query("page") ?? "1", 10);
    const html = await blockDetailPage(
      id,
      rooms !== undefined ? parseInt(rooms, 10) : undefined,
      sort,
      page,
    );
    return c.html(html);
  });

  app.get("/flats/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const html = await flatDetailPage(id);
    return c.html(html);
  });

  app.get("/dynamics", async (c) => {
    const blockId = c.req.query("block");
    const days = parseInt(c.req.query("days") ?? "30", 10);
    const html = await dynamicsPage(
      blockId ? parseInt(blockId, 10) : undefined,
      days,
    );
    return c.html(html);
  });

  return app;
}
