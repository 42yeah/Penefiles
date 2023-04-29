#ifndef PENEFILES_PENEFILESERVICE_HPP
#define PENEFILES_PENEFILESERVICE_HPP

#include <iostream>
#include <map>
#include <random>
#include <mutex>
#include <oatpp/web/protocol/http/Http.hpp>
#include <oatpp/core/macro/codegen.hpp>
#include <oatpp/core/macro/component.hpp>
#include "db/PenefilesDb.hpp"
#include "dto/DTOs.hpp"

class PenefilesService
{
private:
    using Status = oatpp::web::protocol::http::Status;

    OATPP_COMPONENT(std::shared_ptr<PenefilesDb>, database);

    std::map<std::string, oatpp::Object<UserDto> > user_sessions;
    std::mutex mu;

public:
    oatpp::Object<ResponseDto> create_user(const oatpp::Object<UserRegistrationDto> &dto);
    oatpp::Object<ResponseDto> login(const oatpp::Object<UserDto> &dto);

    oatpp::Object<CodeDto> make_code();

    bool authenticate(const std::string &session_id);
    oatpp::Object<UserDto> select_user_by_session(const std::string &session_id); 

    static std::string get_tag_by_filename(const std::string &path);
    static std::string generate_random_string(int n = 16);

    oatpp::Object<ResponseDto> create_file(const oatpp::Object<FileDto> &dto, std::vector<std::string> initial_tags);
    oatpp::Object<ResponseDto> update_file(const oatpp::Object<AuthFileUpdateDto> &dto);
    oatpp::Object<ResponseDto> delete_file(const oatpp::Object<AuthFileInfoDto> &auth_file_info_dto);
    oatpp::Object<ResponseDto> tag_file(const oatpp::Object<FileTagDto> &dto);
    oatpp::Object<ResponseDto> untag_file(const oatpp::Object<FileTagDto> &dto);
    oatpp::Object<FileDto> locate_file(const std::string &realfile);

    oatpp::Object<ResponseDto> create_note(const oatpp::Object<AuthNoteUpdateDto> &dto);
    oatpp::Object<ResponseDto> update_note(const oatpp::Object<AuthNoteUpdateDto> &dto);

    oatpp::Object<DataDto<oatpp::Object<UserDto> > > list_users();
    oatpp::Object<DataDto<oatpp::Object<FileDto> > > list_files(std::string token);
    oatpp::Object<DataDto<oatpp::Object<FileTagDto> > > list_files_tags();
    oatpp::Object<DataDto<oatpp::Object<TagDto> > > list_tags();

    void create_uploads_folder_or_die();
};


#endif // PENEFILES_PENEFILESERVICE_HPP
