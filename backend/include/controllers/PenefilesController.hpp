#ifndef PENEFILES_PENEFILESCONTROLLER_HPP
#define PENEFILES_PENEFILESCONTROLLER_HPP

#include "dto/DTOs.hpp"

#include "oatpp/web/server/api/ApiController.hpp"
#include "oatpp/core/macro/codegen.hpp"
#include "oatpp/core/macro/component.hpp"
#include "services/PenefilesService.hpp"

#include OATPP_CODEGEN_BEGIN(ApiController)

class PenefilesController : public oatpp::web::server::api::ApiController 
{
public:
    /**
     * Constructor with object mapper.
     * @param objectMapper - default object mapper used to serialize/deserialize DTOs.
     */
    PenefilesController(OATPP_COMPONENT(std::shared_ptr<ObjectMapper>, object_mapper))
        : oatpp::web::server::api::ApiController(object_mapper)
    {
    }

private:
    PenefilesService penefiles_service;

public:

    ENDPOINT("GET", "/", root) 
    {
        auto dto = ResponseDto::createShared();
        dto->status = 200;
        dto->message = "Hello World!";
        return createDtoResponse(Status::CODE_200, dto);
    }

    ENDPOINT("POST", "/users/register", register_user,
        BODY_DTO(Object<UserRegistrationDto>, registration_dto))
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.create_user(registration_dto));
    }

    ENDPOINT("GET", "/codes/make", make_code)
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.make_code());
    }
};

#include OATPP_CODEGEN_END(ApiController) //<-- End Codegen

#endif // PENEFILES_PENEFILESCONTROLLER_HPP
