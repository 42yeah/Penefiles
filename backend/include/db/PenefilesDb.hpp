#ifndef PENEFILES_PENEFILESDB_HPP
#define PENEFILES_PENEFILESDB_HPP

#include <oatpp/orm/SchemaMigration.hpp>
#include <oatpp/orm/DbClient.hpp>
#include <oatpp/core/macro/codegen.hpp>
#include <oatpp-sqlite/orm.hpp>
#include "dto/DTOs.hpp"

#include OATPP_CODEGEN_BEGIN(DbClient) ///< Begin code-gen section

class PenefilesDb : public oatpp::orm::DbClient 
{
public:

    PenefilesDb(const std::shared_ptr<oatpp::orm::Executor>& executor)
        : oatpp::orm::DbClient(executor)
    {}

    // 
    // Users
    //
    QUERY(create_user,
          "INSERT INTO users (username, password) VALUES (:username, :password);",
          PARAM(oatpp::String, username), 
          PARAM(oatpp::String, password))

    QUERY(delete_user,
          "DELETE FROM users WHERE username=:username;")

    QUERY(update_user,
          "UPDATE users "
          "SET "
          " password=:user.password, "
          " tags=:user.tags, "
          "WHERE "
          " username=:user.username;",
          PARAM(oatpp::Object<UserDto>, user))

    QUERY(get_all_users,
          "SELECT id, username, tags FROM users;")

    QUERY(login_user, 
          "SELECT * FROM users WHERE username=:username AND password=:password;", 
          PARAM(oatpp::String, username),
          PARAM(oatpp::String, password))

    QUERY(select_user,
          "SELECT username, tags FROM users WHERE id=:id;",
          PARAM(oatpp::Int32, id));

    //
    // Invitation codes
    //
    QUERY(make_code,
          "INSERT INTO codes (code) VALUES (:code);",
          PARAM(oatpp::String, code));

    QUERY(select_code,
          "SELECT * FROM codes WHERE code=:code;",
          PARAM(oatpp::String, code));

    QUERY(delete_code,
          "DELETE FROM codes WHERE code=:code;",
          PARAM(oatpp::String, code));

    // 
    // Tag manipulation
    //
    QUERY(bind_tag_to_file,
          "INSERT INTO files_tags (fileid, tag) VALUES (:fileid, :tag);",
          PARAM(oatpp::Int32, fileid),
          PARAM(oatpp::String, tag));

    QUERY(unbind_tag_from_file,
          "DELETE FROM files_tags WHERE fileid=:fileid AND tag=:tag;",
          PARAM(oatpp::Int32, fileid),
          PARAM(oatpp::String, tag));

    QUERY(list_tags,
          "SELECT DISTINCT tag FROM files_tags;");

    QUERY(list_files_tags,
          "SELECT * FROM files_tags;");

    //
    // File manipulation
    //
    QUERY(create_file,
          "INSERT INTO files (filename, realfile, size) VALUES (:filename, :realfile, :size);",
          PARAM(oatpp::String, filename),
          PARAM(oatpp::String, realfile),
          PARAM(oatpp::Int32, size));

    QUERY(update_file,
          "UPDATE files SET filename=:filename WHERE id=:id;",
          PARAM(oatpp::Int32, id),
          PARAM(oatpp::String, filename));

    QUERY(delete_file,
          "DELETE FROM files WHERE id=:id;",
          PARAM(oatpp::Int32, id));

    QUERY(cleanup_file_tags,
          "DELETE FROM files_tags WHERE fileid=:id;",
          PARAM(oatpp::Int32, id));

    QUERY(list_files,
          "SELECT * FROM files");

    QUERY(get_file_from_realfile,
          "SELECT * FROM files WHERE realfile=:realfile",
          PARAM(oatpp::String, realfile));

    QUERY(find_tags_of_file, 
          "SELECT * FROM files_tags WHERE fileid=:id;",
          PARAM(oatpp::Int32, id));
};

#include OATPP_CODEGEN_END(DbClient) ///< End code-gen section

#endif // PENEFILES_PENEFILESDB_HPP
