#ifndef PENEFILES_PENEFILESERVICE_HPP
#define PENEFILES_PENEFILESERVICE_HPP

#include <iostream>
#include <map>
#include <random>
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

public:
    oatpp::Object<ResponseDto> create_user(const oatpp::Object<UserRegistrationDto> &dto);
    oatpp::Object<ResponseDto> login(const oatpp::Object<UserDto> &dto);

    oatpp::Object<CodeDto> make_code();
};


#endif // PENEFILES_PENEFILESERVICE_HPP
