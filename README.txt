RR SCATTER split setup

Files:
- index.html: page structure, CSS, and image-folder config.
- ascii-logo.js: RATe RACE ASCII logo particle/ripple animation only.
- scatter-gallery.js: image loading, scatter layout, canvas rendering, zoom/drag/touch, hover preview, and link panel.

Required folder structure:
RR SCATTER/
  index.html
  ascii-logo.js
  scatter-gallery.js
  ratrace-logo.png
  scatter-images/
    image1.png
    image2.png
    ...
    image50.png

How to run:
1. Put index.html, ascii-logo.js, scatter-gallery.js, ratrace-logo.png, and scatter-images/ in the same folder.
2. In VS Code, open that folder.
3. Start Live Server.
4. Open index.html through Live Server, not by double-clicking the file.
5. Refresh the browser after adding or replacing images.

Do not rename:
- ascii-logo.js
- scatter-gallery.js
- ratrace-logo.png
- scatter-images

To change image count/path/extensions:
Open index.html and edit:
window.GALLERY_IMAGE_FOLDER
window.GALLERY_IMAGE_SCAN_LIMIT
window.GALLERY_IMAGE_EXTENSIONS

To change only the logo animation:
Edit ascii-logo.js.

To change only scatter placement / zoom / mobile drag / hover preview:
Edit scatter-gallery.js.
