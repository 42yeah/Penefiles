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

#include OATPP_CODEGEN_END(DTO)

#endif // PENEFILES_DTO_HPP

