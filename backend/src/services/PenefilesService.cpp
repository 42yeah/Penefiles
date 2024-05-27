#include "services/PenefilesService.hpp"
#include <filesystem>
#include <random>
#include <sstream>
#include <iostream>
#include <fstream>
#include <oatpp/web/mime/multipart/FileProvider.hpp>
#include <oatpp/web/mime/multipart/InMemoryDataProvider.hpp>
#include <oatpp/web/mime/multipart/Reader.hpp>
#include <oatpp/web/mime/multipart/PartList.hpp>
#include "filesystem.hpp"

// OS-agnostic password input, from: https://stackoverflow.com/questions/1413445/reading-a-password-from-stdcin
#ifdef WIN32
#include <windows.h>
#else
#include <termios.h>
#include <unistd.h>
#endif


PenefilesService::PenefilesService() : running(true)
{
    orphan_watcher_thread = std::make_unique<std::thread>(&PenefilesService::delete_orphans_watcher, this);
    if (!unbox())
    {
        OATPP_LOGE("PENEfiles", "Unboxing has failed. PENEfiles may or may not not be working correctly.");
    }
}

PenefilesService::~PenefilesService()
{
    {
        const std::lock_guard<std::mutex> guardian(mu);
        running = false;
        cv.notify_all();
        OATPP_LOGI("PENEfiles", "Stopping server...");
    }
    
    if (orphan_watcher_thread->joinable())
    {
        orphan_watcher_thread->join();
    }
}

oatpp::Object<ResponseDto> PenefilesService::create_user(const oatpp::Object<UserRegistrationDto> &dto)
{
    const std::lock_guard<std::mutex> guardian(mu);

    OATPP_ASSERT_HTTP(dto->password == dto->passwordAgain, Status::CODE_500, "Passwords does not match");
    OATPP_ASSERT_HTTP(dto->code->size() > 0, Status::CODE_500, "Must provide invitation code");
    auto code_result = database->select_code(dto->code);
    OATPP_ASSERT_HTTP(code_result->isSuccess(), Status::CODE_500, code_result->getErrorMessage());
    OATPP_ASSERT_HTTP(code_result->hasMoreToFetch(), Status::CODE_500, "Nonexistent code");
    code_result->fetch<oatpp::Vector<oatpp::Object<CodeDto> > >();

    auto result = database->create_user(dto->username, dto->password);
    auto response = ResponseDto::createShared();
    OATPP_ASSERT_HTTP(result->isSuccess(), Status::CODE_500, result->getErrorMessage());
    // if (!result->isSuccess())
    // {
    //     response->status = 500;
    //     response->message = result->getErrorMessage();
    //     return response;
    // }

    code_result = database->delete_code(dto->code);
    OATPP_ASSERT_HTTP(code_result->isSuccess(), Status::CODE_500, code_result->getErrorMessage());
    
    response->status = 200;
    response->message = "User created successfully.";
    return response;
}

std::string PenefilesService::generate_random_string(int n)
{
    std::uniform_int_distribution distrib(0, 61);
    std::random_device dev;
    std::stringstream ss;

    for (int i = 0; i < n; i++)
    {
        int code = distrib(dev);
        if (code < 26)
        {
            ss << (char) ('A' + code);
        }
        else if (code < 52)
        {
            ss << (char) ('a' + (code - 26));
        }
        else
        {
            ss << (char) ('0' + (code - 52));
        }
    }
    return ss.str();
}

oatpp::Object<ResponseDto> PenefilesService::login(const oatpp::Object<UserDto> &dto)
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto result = database->login_user(dto->username, dto->password);
    auto res = ResponseDto::createShared();

    OATPP_ASSERT_HTTP(result->isSuccess(), Status::CODE_500, result->getErrorMessage());
    OATPP_ASSERT_HTTP(result->hasMoreToFetch(), Status::CODE_500, "User not found");

    auto user = result->fetch<oatpp::Vector<oatpp::Object<UserDto> > >();
    OATPP_ASSERT_HTTP(user->size() == 1, Status::CODE_500, "Unknown error");

    std::string token = generate_random_string();
    user_sessions[token] = user[0];

    res->status = 200;
    res->message = token;
    return res;
}

oatpp::Object<CodeDto> PenefilesService::make_code(const oatpp::Object<AuthenticationDto> &dto)
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto user = select_user_by_session(dto->session);
    OATPP_ASSERT_HTTP(user, Status::CODE_500, "Not logged in.");

    std::string code = generate_random_string();
    auto res = database->make_code(code);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());

    // Get latest code
    // auto code_id = oatpp::sqlite::Utils::getLastInsertRowId(res->getConnection());
    res = database->select_code(code);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());
    OATPP_ASSERT_HTTP(res->hasMoreToFetch(), Status::CODE_500, "No invitation code corresponding to ID");

    auto entry = res->fetch<oatpp::Vector<oatpp::Object<CodeDto> > >();
    OATPP_ASSERT_HTTP(entry->size() == 1, Status::CODE_500, "Unknown error");

    return entry[0];
}

oatpp::Object<UserDto> PenefilesService::select_user_by_session(const std::string &session_id)
{
    auto pos = user_sessions.find(session_id);
    // std::cout << "Looking for " << session_id << "..." << std::endl;
    // for (auto p : user_sessions) 
    // {
    //     std::cout << p.first << ": " << p.second->username->c_str() << std::endl;
    // }

    OATPP_ASSERT_HTTP(pos != user_sessions.end(), Status::CODE_500, "Invalid session ID.");

    auto id = pos->second->id;
    auto result = database->select_user(id);
    OATPP_ASSERT_HTTP(result->isSuccess(), Status::CODE_500, result->getErrorMessage());
    OATPP_ASSERT_HTTP(result->hasMoreToFetch(), Status::CODE_500, "Cannot find user.");

    auto entry = result->fetch<oatpp::Vector<oatpp::Object<UserDto> > >();
    OATPP_ASSERT_HTTP(entry->size() == 1, Status::CODE_500, "Unknown error");

    return entry[0];
}

bool PenefilesService::authenticate(const std::string &session_id)
{
    // Just a simple auth check.
    if (user_sessions.find(session_id) == user_sessions.end())
    {
        return false;
    }
    return true;
}

std::string PenefilesService::get_tag_by_filename(const std::string &path)
{
    auto pos = path.find_last_of(".");
    if (pos == std::string::npos)
    {
        return "Unknown";
    }
    std::string extension = path.substr(pos);

    if (extension == ".docx" || extension == ".doc" || extension == ".pages" || extension == ".pdf" || extension == ".odt" || extension == ".txt" || extension == ".epub")
    {
        return "Document";
    }
    if (extension == ".rar" || extension == ".7z" || extension == ".gz" || extension == ".bz2" || extension == ".xz" || extension == ".tar.gz" || extension == ".tar.bz2" || extension == ".tar.xz" || extension == ".tar.7z" || extension == ".zip" || extension == ".iso" || extension == ".cab" || extension == ".jar" || extension == ".war" || extension == ".ear" || extension == ".deb" || extension == ".rpm" || extension == ".sitx" || extension == ".sea" || extension == ".z" || extension == ".cpio" || extension == ".tgz")
    {
        return "Archive";
    }
    if (extension == ".jpg" || extension == ".jpeg" || extension == ".png" || extension == ".gif" || extension == ".bmp" || extension == ".tiff" || extension == ".tif" || extension == ".svg" || extension == ".webp" || extension == ".raw" || extension == ".ico" || extension == ".psd")
    {
        return "Image";
    }
    if (extension == ".ppt" || extension == ".pptx" || extension == ".key" || extension == ".odp" || extension == ".otp")
    {
        return "Presentation";
    }
    if (extension == ".mp4" || extension == ".avi" || extension == ".mov" || extension == ".wmv" || extension == ".mkv")
    {
        return "Video";
    }
    if (extension == ".mp3" || extension == ".wav" || extension == ".flac" || extension == ".m4a" || extension == ".ogg" || extension == ".wma")
    {
        return "Audio";
    }
    if (extension == ".xlsx" || extension == ".xls" || extension == ".xlsm" || extension == ".xlsb" || extension == ".xltm" || extension == ".xltx" || extension == ".xlam" || extension == ".ods" || extension == ".fods" || extension == ".csv" || extension == ".numbers")
    {
        return "Spreadsheet";
    }

    return "Unknown";
}

struct UploadEntry
{
    UploadEntry(PenefilesService &service, const std::string &realfile) : service(service), realfile(realfile)
    {
        const std::lock_guard<std::mutex> guardian(service.mu);

        service.upload_entries[realfile] = true;
    }

    ~UploadEntry()
    {
        const std::lock_guard<std::mutex> guardian(service.mu);

        if (service.upload_entries.find(realfile) != service.upload_entries.end())
        {
            service.upload_entries.erase(realfile);
        }
    }

    PenefilesService &service;
    std::string realfile;
};

oatpp::Object<ResponseDto> PenefilesService::upload_file(const std::shared_ptr<oatpp::web::protocol::http::incoming::Request> &request)
{
    namespace multipart = oatpp::web::mime::multipart;

    create_uploads_folder_or_die();

    auto mp = std::make_shared<multipart::PartList>(request->getHeaders());
    multipart::Reader mp_reader(mp.get());
    
    mp_reader.setPartReader("session", multipart::createInMemoryPartReader(32));
    std::string random_filename = fs::path("uploads") / generate_random_string(32);
    UploadEntry entry(*this, random_filename); // This protects the file from being prematurely deleted

    mp_reader.setPartReader("file", multipart::createFilePartReader(random_filename));
    request->transferBody(&mp_reader);

    const auto session_part = mp->getNamedPart("session");
    const auto file_part = mp->getNamedPart("file");
    OATPP_ASSERT_HTTP(session_part, Status::CODE_500, "Session cannot be empty");
    std::string session_id(session_part->getPayload()->getInMemoryData()->c_str());

    // Critical part
    {
        const std::lock_guard<std::mutex> guardian(mu);

        auto user = select_user_by_session(session_id);

        OATPP_ASSERT_HTTP(file_part && file_part->getFilename(), Status::CODE_500, "File cannot be empty");
        OATPP_ASSERT_HTTP(file_part->getFilename()->c_str(), Status::CODE_500, "Incomplete file");

        // Take a look at whether this file can be stat
        auto file_stat = fs::status(random_filename);
        OATPP_ASSERT_HTTP(fs::status_known(file_stat) && file_stat.type() != fs::file_type::not_found, Status::CODE_500, "File not uploaded");

        std::string file_name = file_part->getFilename()->c_str();

        std::vector<std::string> initial_tags;
        initial_tags.insert(initial_tags.end(), 
        {
            user->username->c_str(),
            PenefilesService::get_tag_by_filename(file_name)
        });

        auto file_dto = FileDto::createShared();
        file_dto->filename = file_name;
        file_dto->realfile = random_filename;
        file_dto->size = fs::file_size(random_filename);
        create_file(file_dto, initial_tags);

        OATPP_LOGI("PENEfiles", "User %s has uploaded %s. Initial tags: %s, %s.", user->username->c_str(), file_name.c_str(), initial_tags[0].c_str(), initial_tags[1].c_str());
        
        auto res = ResponseDto::createShared();
        res->status = 200;
        res->message = random_filename;
        return res;
    }
}

oatpp::Object<ResponseDto> PenefilesService::create_file(const oatpp::Object<FileDto> &dto, std::vector<std::string> initial_tags)
{
    auto res = database->create_file(dto->filename, dto->realfile, dto->size, 0);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());

    int id = oatpp::sqlite::Utils::getLastInsertRowId(res->getConnection());

    for (const auto &file_tag : initial_tags)
    {
        res = database->bind_tag_to_file(id, file_tag);
        if (!res->isSuccess())
        {
            OATPP_LOGW("PENEfiles", "Cannot bind tag %s to %s: %s.", file_tag.c_str(), dto->filename->c_str(), res->getErrorMessage()->c_str());
        }
    }

    oatpp::Object<ResponseDto> response = ResponseDto::createShared();
    response->status = 200;
    response->message = "OK";
    return response;
}

oatpp::Object<ResponseDto> PenefilesService::update_file(const oatpp::Object<AuthFileUpdateDto> &dto)
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto user = select_user_by_session(dto->session);
    auto file = locate_file(dto->realfile);
    auto res = database->find_tags_of_file(file->id);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());
    bool should_update = false;
    std::vector<std::string> file_tags;

    if (!res->hasMoreToFetch())
    {
        OATPP_LOGI("PENEfiles", "No one owns %s. Therefore, no one can update it.", file->realfile->c_str());
        should_update = false;
    }
    else
    {
        // Check for user tag. If I own it, I can update it.
        auto tags = res->fetch<oatpp::Vector<oatpp::Object<FileTagDto> > >();
        OATPP_ASSERT_HTTP(tags->size() > 0, Status::CODE_500, "Unknown error while checking for tags during deletion");
        for (int i = 0; i < tags->size(); i++)
        {
            if (tags[i]->tag == user->username)
            {
                should_update = true;
            }
            file_tags.push_back(tags[i]->tag);
        }
    }
    OATPP_ASSERT_HTTP(should_update, Status::CODE_500, "You do not own this file.");

    res = database->update_file(file->id, dto->filename, dto->confidentiality);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());

    std::vector<std::string> tags_to_add;
    for (int i = 0; i < dto->tags->size(); i++)
    {
        std::string tag = dto->tags[i];
        auto pos = std::find(file_tags.begin(), file_tags.end(), tag);
        if (pos == file_tags.end())
        {
            tags_to_add.push_back(tag);
            continue;
        }
        file_tags.erase(pos, pos + 1);
    }

    //
    // At the end of the day,
    // Tags inside file_tags are to be removed;
    // Tags in tags_to_add are to be added.
    //
    for (const auto &t : file_tags)
    {
        res = database->unbind_tag_from_file(file->id, t);
        OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, "Cannot remove tag from file.");
    }
    for (const auto &t : tags_to_add)
    {
        res = database->bind_tag_to_file(file->id, t);
        OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, "Cannot bind tag to file.");
    }

    res = database->is_file_orphaned(file->id);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());
    if (!res->hasMoreToFetch())
    {
        res = database->bind_tag_to_file(file->id, user->username);
        OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, "Cannot bind tag to file.");
    }

    oatpp::Object<ResponseDto> response = ResponseDto::createShared();
    response->status = 200;
    response->message = "OK";
    return response;
}

oatpp::Object<ResponseDto> PenefilesService::delete_file(const oatpp::Object<AuthFileInfoDto> &auth_file_info_dto)
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto user = select_user_by_session(auth_file_info_dto->session);
    auto file = locate_file(auth_file_info_dto->realfile);
    auto res = database->find_tags_of_file(file->id);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());
    bool should_delete = false;

    if (!res->hasMoreToFetch())
    {
        OATPP_LOGI("PENEfiles", "No one owns %s. It will be deleted now.", file->realfile->c_str());
        should_delete = true;
    }
    else 
    {
        // Check for user tag. If I own it, I can delete it.
        auto tags = res->fetch<oatpp::Vector<oatpp::Object<FileTagDto> > >();
        OATPP_ASSERT_HTTP(tags->size() > 0, Status::CODE_500, "Unknown error while checking for tags during deletion");
        for (int i = 0; i < tags->size(); i++)
        {
            if (tags[i]->tag == user->username)
            {
                should_delete = true;
                break;
            }
        }
    }

    OATPP_ASSERT_HTTP(should_delete, Status::CODE_500, "You do not own this file.");

    // Delete the real file.
    auto path = fs::path(file->realfile);
    auto stat = fs::status(path);
    if (fs::status_known(stat) && stat.type() != fs::file_type::not_found)
    {
        OATPP_LOGI("PENEfiles", "Deleting file %s...", path.c_str());
        fs::remove(path);
    }

    res = database->delete_file(file->id);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());

    res = database->cleanup_file_tags(file->id);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());

    oatpp::Object<ResponseDto> response = ResponseDto::createShared();
    response->status = 200;
    response->message = "OK";
    return response;
}

oatpp::Object<ResponseDto> PenefilesService::tag_file(const oatpp::Object<FileTagDto> &dto)
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto res = database->bind_tag_to_file(dto->fileid, dto->tag);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());

    oatpp::Object<ResponseDto> response = ResponseDto::createShared();
    response->status = 200;
    response->message = "OK";
    return response;
}

oatpp::Object<ResponseDto> PenefilesService::untag_file(const oatpp::Object<FileTagDto> &dto)
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto res = database->unbind_tag_from_file(dto->fileid, dto->tag);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());

    oatpp::Object<ResponseDto> response = ResponseDto::createShared();
    response->status = 200;
    response->message = "OK";
    return response;
}

oatpp::Object<DataDto<oatpp::Object<FileDto> > > PenefilesService::list_files(std::string token)
{
    const std::lock_guard<std::mutex> guardian(mu);

    std::shared_ptr<oatpp::orm::QueryResult> res = nullptr;
    if (token == "")
    {
        res = database->list_files();
    }
    else
    {
        OATPP_ASSERT_HTTP(authenticate(token), Status::CODE_500, "Not logged in.");
        auto user = user_sessions[token];
        res = database->list_files_authed(user->username);
    }

    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());
    // OATPP_ASSERT_HTTP(res->hasMoreToFetch(), Status::CODE_500, "No files found");

    auto files = res->fetch<oatpp::Vector<oatpp::Object<FileDto> > >();
    // OATPP_ASSERT_HTTP(files->size() > 0, Status::CODE_500, "No files");

    auto ret = DataDto<oatpp::Object<FileDto> >::createShared();
    ret->count = files->size();
    ret->items = files;
    return ret;

    
}

oatpp::Object<DataDto<oatpp::Object<FileTagDto> > > PenefilesService::list_files_tags()
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto res = database->list_files_tags();
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());
    // OATPP_ASSERT_HTTP(res->hasMoreToFetch(), Status::CODE_500, "No files & tags found");

    auto files_tags = res->fetch<oatpp::Vector<oatpp::Object<FileTagDto> > >();
    // OATPP_ASSERT_HTTP(files_tags->size() > 0, Status::CODE_500, "No files & tags");

    auto ret = DataDto<oatpp::Object<FileTagDto> >::createShared();
    ret->count = files_tags->size();
    ret->items = files_tags;
    return ret;
}

oatpp::Object<DataDto<oatpp::Object<TagDto> > > PenefilesService::list_tags()
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto res = database->list_tags();
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());
    // OATPP_ASSERT_HTTP(res->hasMoreToFetch(), Status::CODE_500, "No tags found");

    auto tags = res->fetch<oatpp::Vector<oatpp::Object<TagDto> > >();
    // OATPP_ASSERT_HTTP(tags->size() > 0, Status::CODE_500, "No tags");

    auto ret = DataDto<oatpp::Object<TagDto> >::createShared();
    ret->count = tags->size();
    ret->items = tags;
    return ret;
}

oatpp::Object<DataDto<oatpp::Object<UserDto> > > PenefilesService::list_users()
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto res = database->get_all_users();
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());
    // OATPP_ASSERT_HTTP(res->hasMoreToFetch(), Status::CODE_500, "No users found");

    auto users = res->fetch<oatpp::Vector<oatpp::Object<UserDto> > >();
    // OATPP_ASSERT_HTTP(users->size() > 0, Status::CODE_500, "No users");

    auto ret = DataDto<oatpp::Object<UserDto> >::createShared();
    ret->count = users->size();
    ret->items = users;
    return ret;
}

oatpp::Object<FileDto> PenefilesService::locate_file(const std::string &realfile)
{
    std::string complete_real_file = std::string("uploads/") + realfile;
    
    auto res = database->get_file_from_realfile(complete_real_file);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());
    OATPP_ASSERT_HTTP(res->hasMoreToFetch(), Status::CODE_404, "File not found");

    auto file = res->fetch<oatpp::Vector<oatpp::Object<FileDto> > >();
    OATPP_ASSERT_HTTP(file->size() == 1, Status::CODE_500, "Unknown file error");

    return file[0];
}

oatpp::Object<ResponseDto> PenefilesService::create_note(const oatpp::Object<AuthNoteUpdateDto> &dto)
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto user = select_user_by_session(dto->session);
    std::vector<std::string> tags;
    for (int i = 0; i < dto->tags->size(); i++)
    {
        tags.push_back(dto->tags[i]);
    }
    if (std::find(tags.begin(), tags.end(), std::string(user->username)) == tags.end())
    {
        tags.push_back(user->username);
    }

    create_uploads_folder_or_die();

    std::string realfile = fs::path("uploads") / generate_random_string(32);

    std::ofstream writer(realfile);
    OATPP_ASSERT_HTTP(writer.good(), Status::CODE_500, "Cannot open file to write");
    writer << dto->content->c_str();
    writer.close();

    auto res = database->create_file(dto->filename, realfile, dto->content->size(), dto->confidentiality);
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());
    int id = oatpp::sqlite::Utils::getLastInsertRowId(res->getConnection());

    for (const auto &file_tag : tags)
    {
        res = database->bind_tag_to_file(id, file_tag);
        if (!res->isSuccess())
        {
            OATPP_LOGW("PENEfiles", "Cannot bind tag %s to %s: %s.", file_tag.c_str(), dto->filename->c_str(), res->getErrorMessage()->c_str());
        }
    }

    oatpp::Object<ResponseDto> response = ResponseDto::createShared();
    response->status = 200;
    response->message = realfile;
    return response;
}

oatpp::Object<ResponseDto> PenefilesService::update_note(const oatpp::Object<AuthNoteUpdateDto> &dto)
{
    auto update_dto = AuthFileUpdateDto::createShared();
    update_dto->filename = dto->filename;
    update_dto->realfile = dto->realfile;
    update_dto->session = dto->session;
    update_dto->tags = dto->tags;
    update_dto->confidentiality = dto->confidentiality;
    update_file(update_dto);

    const std::lock_guard<std::mutex> guardian(mu);
    auto file = locate_file(dto->realfile);
    std::ofstream writer(file->realfile);
    OATPP_ASSERT_HTTP(writer.good(), Status::CODE_500, "Cannot open file");
    writer << dto->content->c_str();
    writer.close();

    oatpp::Object<ResponseDto> response = ResponseDto::createShared();
    response->status = 200;
    response->message = dto->realfile;
    return response;
}

void PenefilesService::create_uploads_folder_or_die()
{
    fs::path uploads("uploads");
    auto stat = fs::status(uploads);
    if (fs::status_known(stat) && stat.type() == fs::file_type::not_found)
    {
        OATPP_LOGI("PENEfiles", "Creating directory uploads/...");
        fs::create_directory(uploads);
    }
    stat = fs::status(uploads);
    OATPP_ASSERT_HTTP(stat.type() == fs::file_type::directory, Status::CODE_500, "PENEfiles cannot create uploads. This is a severe server side error. Please contact admin.");
}

void PenefilesService::delete_orphans_watcher()
{
    std::unique_lock<std::mutex> lock(mu);
    while (running)
    {
        const auto status = cv.wait_for(lock, std::chrono::seconds(60));
        if (!running)
        {
            // The program is closing.
            break;
        }

        int orphans_removed = delete_orphans();

        if (orphans_removed != 0)
        {
            OATPP_LOGI("PENEfiles", "Orphans removed: %d", orphans_removed);
        }
    };
}

int PenefilesService::delete_orphans()
{
    // Step 1: list files under uploads/.
    // Step 2: for each file, see if it's in the database. 
    // Step 3: delete everything that's not.
    fs::path uploads("uploads");
    auto stat = fs::status(uploads);
    if (fs::status_known(stat) && stat.type() == fs::file_type::not_found)
    {
        OATPP_LOGI("PENEfiles", "Creating directory uploads/...");
        fs::create_directory(uploads);
    }

    int orphans_removed = 0;
    for (const auto &entry : fs::directory_iterator(uploads))
    {
        std::string real_file = std::string("uploads/") + entry.path().filename().string();
        if (upload_entries.find(real_file) != upload_entries.end())
        {
            OATPP_LOGI("PENEfiles", "File is being uploaded: %s.", real_file.c_str());
            continue;
        }

        auto res = database->get_file_from_realfile(real_file);
        if (!res->isSuccess())
        {
            OATPP_LOGE("PENEfiles", "Unsuccessful query: %s.", real_file.c_str());
            continue;
        }
        
        if (!res->hasMoreToFetch())
        {
            if (!fs::remove(entry))
            {
                OATPP_LOGE("PENEfiles", "Cannot remove orphan: %s.", real_file.c_str());
            }
            else 
            {
                OATPP_LOGI("PENEfiles", "Orphan %s removed.", real_file.c_str());
                orphans_removed++;
            }
        }
        else
        {
            res->fetch<oatpp::Vector<oatpp::Object<FileDto> > >();
        }
    }
    return orphans_removed;
}

void PenefilesService::set_stdin_echo(bool enabled)
{
#ifdef WIN32
    HANDLE hstdin = GetStdHandle(STD_INPUT_HANDLE);
    DWORD mode;
    GetConsoleMode(hstdin, &mode);
    if(!enabled)
        mode &= ~ENABLE_ECHO_INPUT;
    else
        mode |= ENABLE_ECHO_INPUT;
    SetConsoleMode(hStdin, mode );
#else
    termios tty;
    tcgetattr(STDIN_FILENO, &tty);
    if (!enabled)
    {
        tty.c_lflag &= ~ECHO;
    }
    else
    {
        tty.c_lflag |= ECHO;
    }
    tcsetattr(STDIN_FILENO, TCSANOW, &tty);
#endif
}


bool PenefilesService::unbox()
{
    auto res = database->get_all_users();
    OATPP_ASSERT_HTTP(res->isSuccess(), Status::CODE_500, res->getErrorMessage());

    auto users = res->fetch<oatpp::Vector<oatpp::Object<UserDto> > >();
    if (!users->empty())
    {
        return true;
    }

    std::cout << "Hello and welcome to PENEfiles. Some additional configs are required for a your personal fully functional tag-based file management system. Answer the following questions so that we can get it set up together." << std::endl;
    std::cout << "Are you using NGINX? (y/n) ";
    std::string response;
    std::getline(std::cin, response);

    if (response != "y")
    {
        std::cout << "Since I didn't work with other web servers before, I can't really help you; however, the core concepts are the same, so here's what you need to do:" << std::endl
                  << "  - Setup a virtual host and point `/` to where the frontend is." << std::endl
                  << "  - Setup a reverse proxy at `/api` to localhost:4243." << std::endl
                  << "  - Update `frontend/js/config.js` and set the `API` url accordingly." << std::endl;
    }
    else
    {
        fs::path this_path("frontend");
        std::string frontend = fs::absolute(this_path);
        std::cout << "Where is the frontend? (" << frontend << ")" << std::endl;
        std::getline(std::cin, response);
        if (!response.empty())
        {
            frontend = response;
        }
        std::cout << "Server domain name? Doesn't have to be a proper domain name. IP works as well. (localhost)" << std::endl;
        std::string domain = "localhost";
        std::getline(std::cin, response);
        if (!response.empty())
        {
            domain = response;
        }

        constexpr char nginx_temp[8192] = R"nginx(server {
    listen 80;
    listen [::]:80;
    server_name %s;
    client_max_body_size 1024M;

    location / {
        root %s;
        index index.html index.htm;
    }

    location /api {
        rewrite /api(.*) /$1 break;
        proxy_pass http://127.0.0.1:4243;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 15;
        proxy_connect_timeout 15;
        proxy_send_timeout 15;
    }
})nginx";

        constexpr char conf_temp[8192] = R"js(export const API = "http://%s/api";
export const FRONTEND = "http://%s";
export const FIRST_TIME = false;)js";
        char nginx[8192] = { 0 }, conf[8192] = { 0 };
        snprintf(nginx, sizeof(nginx), nginx_temp, domain.c_str(), frontend.c_str());
        snprintf(conf, sizeof(conf), conf_temp, domain.c_str(), domain.c_str());

        std::cout << "OK. Here's your NGINX config. Add it to your config files in `/etc/nginx/conf.d` or whatever." << std::endl;
        std::cout << "--" << std::endl;
        std::cout << nginx << std::endl;
        std::cout << "--" << std::endl;
        std::cout << "Press enter to continue..." << std::endl;
        std::getline(std::cin, response);

        std::cout << "Here's the frontend config. Replace the innards of `frontend/js/config.js` with the following code." << std::endl;
        std::cout << "--" << std::endl;
        std::cout << conf << std::endl;
        std::cout << "--" << std::endl;

        std::cout << "Do you want me do that for you? (y/n) " << std::endl;
        std::getline(std::cin, response);
        if (response == "y")
        {
            char frontend_path[1024] = { 0 };
            snprintf(frontend_path, sizeof(frontend_path), "%s/js/config.js", frontend.c_str());

            {
                std::ofstream writer(frontend_path);
                if (!writer.good())
                {
                    std::cerr << "Cannot overwrite content in config.js. You might have to do it yourself." << std::endl;
                }
                else
                {
                    writer << conf;
                }
            }
            std::cout << "Done and done." << std::endl;
        }
    }

    std::cout << "Is everything setup? (y/n) ";
    std::getline(std::cin, response);
    if (response != "y")
    {
        std::cout << "Please set them up first." << std::endl;
        return false;
    }

    std::cout << "Time has come to create the first account. PENEfiles works on an invitation code basis, so the first one has to be created in this dingy TTY, because I am too lazy to make a specified UI frontend just for the first one. I do apologize." << std::endl;
    response = "";
    while (response.empty())
    {
        std::cout << "Username: ";
        std::getline(std::cin, response);
        if (response.empty())
        {
            std::cout << "Username cannot be empty." << std::endl;
        }
    }
    std::string username = response;
    std::string password = "";
    set_stdin_echo(false);
    while (true)
    {
        password = "";
        response = "";
        while (response.empty())
        {
            std::cout << "Password: ";
            std::getline(std::cin, response);
            std::cout << std::endl;
            if (response.empty())
            {
                std::cout << "Password cannot be empty." << std::endl;
            }
        }
        password = response;
        response = "";
        std::cout << "Confirm: ";
        std::getline(std::cin, response);
        std::cout << std::endl;
        if (response.empty() || response != password)
        {
            std::cout << "Confirmation failed." << std::endl;
        }
        else
        {
            break;
        }
    }
    set_stdin_echo(true);

    auto result = database->create_user(username, password);
    if (!result->isSuccess())
    {
        std::cerr << "Error: failed to create account. Is the database located in ./sql/penefiles.sqlite3?" << std::endl;
        std::cout << "       after making sure, run `penefiles` again." << std::endl;
        return false;
    }
    std::cout << "Setup done. PENEfiles is officially starting..." << std::endl;

    return true;
}
