#ifndef PENEFILES_PENEFILESCONTROLLER_HPP
#define PENEFILES_PENEFILESCONTROLLER_HPP

#include "dto/DTOs.hpp"

#include <oatpp/web/server/api/ApiController.hpp>
#include <oatpp/core/macro/codegen.hpp>
#include <oatpp/core/macro/component.hpp>
#include <oatpp/web/mime/multipart/FileProvider.hpp>
#include <oatpp/web/mime/multipart/InMemoryDataProvider.hpp>
#include <oatpp/web/mime/multipart/Reader.hpp>
#include <oatpp/web/mime/multipart/PartList.hpp>
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

    ENDPOINT("POST", "/users/login", login,
        BODY_DTO(Object<UserDto>, user_dto))
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.login(user_dto));
    }

    ENDPOINT("GET", "/codes/make", make_code)
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.make_code());
    }

    //
    // File manipulation.
    //
    ENDPOINT("POST", "/auth/preflight", auth_preflight,
        BODY_DTO(Object<AuthenticationDto>, auth_dto))
    {
        oatpp::Object<ResponseDto> res = ResponseDto::createShared();

        if (penefiles_service.authenticate(auth_dto->session))
        {
            res->status = 200;
            res->message = "OK";
        }
        else
        {
            res->status = 500;
            res->message = "Authentication failed";
        }

        return createDtoResponse(Status::CODE_200, res);
    }

    ENDPOINT("POST", "/files/upload", files_upload,
        REQUEST(std::shared_ptr<IncomingRequest>, request))
    {
        namespace multipart = oatpp::web::mime::multipart;

        auto mp = std::make_shared<multipart::PartList>(request->getHeaders());
        multipart::Reader mp_reader(mp.get());
        
        mp_reader.setPartReader("session", multipart::createInMemoryPartReader(32));
        mp_reader.setPartReader("file", multipart::createFilePartReader("file"));
        request->transferBody(&mp_reader);

        const auto session_part = mp->getNamedPart("session");
        const auto file_part = mp->getNamedPart("file");
        OATPP_ASSERT_HTTP(session_part, Status::CODE_500, "Session cannot be empty");
        std::string session_id(session_part->getPayload()->getInMemoryData()->c_str());

        auto user = penefiles_service.select_user_by_session(session_id);

        OATPP_ASSERT_HTTP(file_part && file_part->getFilename(), Status::CODE_500, "File cannot be empty");
        OATPP_ASSERT_HTTP(file_part->getFilename()->c_str(), Status::CODE_500, "Incomplete file");
        printf("FILE PART : %p\n", file_part->getFilename()->c_str());
        
        std::cout << file_part->getFilename()->c_str() << std::endl;

        std::cout << session_id << " " << user->username->c_str() << ": #parts: " << mp->count() << std::endl;

        return createResponse(Status::CODE_200, "OK");
    }
};

#include OATPP_CODEGEN_END(ApiController) //<-- End Codegen

#endif // PENEFILES_PENEFILESCONTROLLER_HPP
