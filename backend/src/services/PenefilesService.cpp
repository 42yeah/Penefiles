#include "services/PenefilesService.hpp"
#include <random>
#include <sstream>
#include <iostream>
#include "filesystem.hpp"

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

oatpp::Object<CodeDto> PenefilesService::make_code()
{
    const std::lock_guard<std::mutex> guardian(mu);

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

oatpp::Object<ResponseDto> PenefilesService::create_file(const oatpp::Object<FileDto> &dto, std::vector<std::string> initial_tags)
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto res = database->create_file(dto->filename, dto->realfile, dto->size);
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

    res = database->update_file(file->id, dto->filename);
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

oatpp::Object<DataDto<oatpp::Object<FileDto> > > PenefilesService::list_files()
{
    const std::lock_guard<std::mutex> guardian(mu);

    auto res = database->list_files();
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
