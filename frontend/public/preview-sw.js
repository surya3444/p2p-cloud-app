// frontend/public/preview-sw.js
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // We only care about requests that we've rewritten to use our proxy path.
  if (url.origin === self.origin && url.pathname.startsWith('/p2p-proxy/')) {
    // Extract the real file path the website is asking for.
    const filePath = url.pathname.substring('/p2p-proxy/'.length);

    event.respondWith(new Promise(async (resolve) => {
      // Get a reference to the main WebViewer page.
      const client = await self.clients.get(event.clientId);
      if (!client) {
        // If we can't find the page, fail the request.
        return resolve(new Response('P2P client not found', { status: 500 }));
      }

      // Create a one-time channel to get the file content back from the main page.
      const channel = new MessageChannel();
      
      channel.port1.onmessage = (msgEvent) => {
        // The main page has sent us the file content (or an error).
        if (msgEvent.data.error) {
          resolve(new Response('File not found on P2P host.', { status: 404 }));
        } else {
          // Success! Create a response with the file's content and type.
          const blob = new Blob([msgEvent.data.content], { type: msgEvent.data.type });
          resolve(new Response(blob));
        }
      };

      // Send the request to the main page, asking it to fetch the file via P2P.
      client.postMessage({ type: 'get-p2p-file', path: filePath }, [channel.port2]);
    }));
  }
});