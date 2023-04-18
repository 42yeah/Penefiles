#ifndef PENEFILES_DTOS_HPP
#define PENEFILES_DTOS_HPP

#include <oatpp/core/macro/codegen.hpp>
#include <oatpp/core/Types.hpp>

#include OATPP_CODEGEN_BEGIN(DTO)

class ResponseDto : public oatpp::DTO
{
    DTO_INIT(ResponseDto, DTO)

    DTO_FIELD(Int32, status);
    DTO_FIELD(String, message);
};

class UserRegistrationDto : public oatpp::DTO 
{
    DTO_INIT(UserRegistrationDto, DTO)

    DTO_FIELD(String, username);
    DTO_FIELD(String, password);
    DTO_FIELD(String, passwordAgain);
    DTO_FIELD(String, code);
};

class UserDto : public oatpp::DTO
{
    DTO_INIT(UserDto, DTO)

    DTO_FIELD(Int32, id);
    DTO_FIELD(String, username);
    DTO_FIELD(String, password);
    DTO_FIELD(String, tags);
};

class CodeDto : public oatpp::DTO 
{
    DTO_INIT(CodeDto, DTO)

    DTO_FIELD(Int32, id);
    DTO_FIELD(String, code);
};

class AuthenticationDto : public oatpp::DTO
{
    DTO_INIT(AuthenticationDto, DTO)

    DTO_FIELD(String, session);
};

class AuthFileInfoDto : public oatpp::DTO
{
    DTO_INIT(AuthFileInfoDto, DTO)

    DTO_FIELD(String, session);
    DTO_FIELD(String, realfile);
    DTO_FIELD(String, filename);
};

class FileDto : public oatpp::DTO
{
    DTO_INIT(FileDto, DTO);

    DTO_FIELD(Int32, id);
    DTO_FIELD(String, filename);
    DTO_FIELD(String, realfile);
    DTO_FIELD(String, created_at);
    DTO_FIELD(String, modified_at);
    DTO_FIELD(Int32, size);
};

class FileTagDto : public oatpp::DTO
{
    DTO_INIT(FileTagDto, DTO)

    DTO_FIELD(Int32, fileid);
    DTO_FIELD(String, tag);
};

class TagDto : public oatpp::DTO
{
    DTO_INIT(TagDto, DTO)

    DTO_FIELD(String, tag);
};

class AuthFileUpdateDto : public oatpp::DTO
{
    DTO_INIT(AuthFileUpdateDto, DTO)

    DTO_FIELD(String, session);
    DTO_FIELD(String, realfile);
    DTO_FIELD(String, filename);
    DTO_FIELD(Vector<String>, tags);
};

template<typename T>
class DataDto : public oatpp::DTO
{
    DTO_INIT(DataDto, DTO)

    DTO_FIELD(Int32, count);
    DTO_FIELD(Vector<T>, items);
};

#include OATPP_CODEGEN_END(DTO)

#endif // PENEFILES_DTO_HPP

