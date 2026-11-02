import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountMousePet } from "./lib/mouse-pet.ts";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "mouse-pet",
    mount: ({ signal }) => mountMousePet({ signal }),
  });
});
