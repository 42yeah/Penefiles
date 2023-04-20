const cacheName = "penefiles-cache-v5";
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

const deleteCache = async (key) => {
    console.log("Removing old cache ", key);
    await caches.delete(key);
};

const deleteOldCaches = async () => {
    const keepList = [cacheName];
    const keyList = await caches.keys();
    const toDelete = keyList.filter(key => {
        return !keepList.includes(key)
    });
    await Promise.all(toDelete.map(deleteCache));
}

self.addEventListener("install", e => {
    e.waitUntil(caches.open(cacheName).then(async cache => {
        await deleteOldCaches();
        return cache.addAll(resourcesToCache);
    }));
    updated = true;
    console.log("PENEfiles frontend cache", cacheName, "is installed");
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
