const cacheName = "penefiles-cache";
const hostName = "http://127.0.0.1:4242";

const resourcesToCache = [
    "/",
    "/index.html",
    "/css/styles.css",
    "/js/sqljs-wasm/sql-wasm.js",
    "/js/sqljs-wasm/sql-wasm.wasm",
    "/js/config.js",
    "/js/main.js",
    "/js/penefiles.js",
    "/assets/accept.svg",
    "/assets/add.svg",
    "/assets/application_delete.svg",
    "/assets/asterisk_yellow.svg",
    "/assets/bin.svg",
    "/assets/bug_go.svg",
    "/assets/cancel.svg",
    "/assets/date.svg",
    "/assets/disconnect.svg",
    "/assets/disk.svg",
    "/assets/house.svg",
    "/assets/key.svg",
    "/assets/lightning.svg",
    "/assets/page_white_edit.svg",
    "/assets/status_online.svg",
    "/assets/textfield_rename.svg",
];

self.addEventListener("install", e => {
    e.waitUntil(caches.open(cacheName).then(cache => {
        return cache.addAll(resourcesToCache);
    }));
});

self.addEventListener("fetch", e => {
    e.respondWith(
        caches.match(e.request).then(res => {
            if (res) {
                return res;
            }
            return fetch(e.request);
        })
    );
});
