import { createComponent } from "@li3/web";
import "./selector.js";
import { select, store } from "../store/store.js";

const template = `<div class="flex h-12 items-center px-3 border-b space-x-2">
  <js-selector placeholder="Select a lambda" class="w-full"></js-selector>
  <button
    ^click="signout"
    .hidden="!isLoggedIn"
    class="flex items-center ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 p-2"
  >
    <span class="material-icons">logout</span>
    <span class="sr-only">Sign Out</span>
  </button>
  <button
    ^click="signin"
    .hidden="isLoggedIn"
    class="flex items-center ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 p-2"
  >
    <span class="material-icons">person</span>
    <span class="sr-only">Sign In</span>
  </button>
</div>`;

function setup() {
  const isLoggedIn = select((s) => !!s.profileId);

  return {
    isLoggedIn,
    onSignIn() {
      isLoggedIn.value ? store.dispatch.signout() : store.signin();
    },
  };
}

createComponent("js-topbar", { setup, template });
