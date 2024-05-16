## Penefiles 

> Warning: [name subject to change](https://www.reddit.com/r/selfhosted/comments/1cf57ln/comment/l1ndezs/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button).

Penefiles is split into two parts, frontend and backend. Frontend is written in vanilla JavaScript, and hopefully is very fast; while backend is written in C++ Oat++.

## Getting Started

First, clone the repository.

```bash
git clone --recursive https://github.com/42yeah/Penefiles 
```

Nothing needs to be done on the frontend part. As for the backend, you will need both [oatpp](https://github.com/oatpp/oatpp) and [oatpp-sqlite](https://github.com/oatpp/oatpp-sqlite). Don't worry if you don't have them; the recursive clone should cloned both of them down.

Go to the `backend/` directory and build PENEfiles backend:

```bash
cd backend
mkdir build
cd build
cmake .. -G Ninja # optional: -DCMAKE_BUILD_TYPE=Release
ninja
```

Everything should now be in the `build` directory. A full PENEfiles instance should contain:

- `frontend` directory with the frontend;
- `sql` directory, which stores the file data;
- `uploads` directory which stores uploaded files.

Run `./penefiles` to start the unboxing run. You will be prompted a few things - this is needed to figure out a configure for you, as PENEfiles requires NGINX (or other webservers) to work. Just follow the instructions. Good luck and have fun! (Also, don't accidentally `ninja` again since that will definitely wipe your db.)

## Auto Tagging

PENEfiles support auto-tagging of several files based on their extensions. So far, this is hardcoded into the backend and there's no way to change it... yet.

- zip, rar, 7z: Archive
- pdf, docx, doc: Document
- ppt, pptx: Presentation
- xls, xlsx, csv: Spreadsheet
- png, jpg, tiff, jpeg, gif, heic: Image
- mp3, wav, flac, m4a: Audio
- mp4, avi, mov, wmv: Video
