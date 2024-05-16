#ifndef PENEFILES_PENEFILESCONTROLLER_HPP
#define PENEFILES_PENEFILESCONTROLLER_HPP

#include "dto/DTOs.hpp"

#include <oatpp/web/server/api/ApiController.hpp>
#include <oatpp/core/macro/codegen.hpp>
#include <oatpp/core/macro/component.hpp>
#include <oatpp/core/data/stream/FileStream.hpp>
#include <oatpp/web/protocol/http/outgoing/StreamingBody.hpp>
#include "services/PenefilesService.hpp"
#include "filesystem.hpp"

#include OATPP_CODEGEN_BEGIN(ApiController)

class PenefilesController : public oatpp::web::server::api::ApiController 
{
public:
    /**
     * Constructor with object mapper.
     * @param objectMapper - default object mapper used to serialize/deserialize DTOs.
     */
    PenefilesController(OATPP_COMPONENT(std::shared_ptr<ObjectMapper>, object_mapper)) :
    oatpp::web::server::api::ApiController(object_mapper)
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

    ENDPOINT("GET", "/users", list_users)
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.list_users());
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

    ENDPOINT("POST", "/codes/make", make_code,
             BODY_DTO(Object<AuthenticationDto>, authentication_dto))
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.make_code(authentication_dto));
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

    ENDPOINT("GET", "/files", files,
             REQUEST(std::shared_ptr<IncomingRequest>, request))
    {
        auto authorization = request->getHeader("Authorization");
        std::string token = "";

        if (authorization && authorization->size() > 7)
        {
            token = authorization->substr(7);
            if (!penefiles_service.authenticate(token))
            {
                token = "";
            }
        }

        return createDtoResponse(Status::CODE_200, penefiles_service.list_files(token));
    }

    ENDPOINT("GET", "/tags", tags)
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.list_tags());
    }

    ENDPOINT("GET", "/files-tags", files_tags)
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.list_files_tags());
    }

    // TODO: Private login check.
    ENDPOINT("GET", "/uploads/{realfile}/{filename}", download,
             PATH(String, realfile),
             PATH(String, filename))
    {
        auto file = penefiles_service.locate_file(realfile->c_str());
        OATPP_LOGI("PENEfiles", "Serving %s (real: %s).", file->filename->c_str(), file->realfile->c_str());

        auto body = std::make_shared<oatpp::web::protocol::http::outgoing::StreamingBody>(
            std::make_shared<oatpp::data::stream::FileInputStream>(file->realfile->c_str())
            );

        auto outgoing_response = OutgoingResponse::createShared(Status::CODE_200, body);
        outgoing_response->putHeader("Content-Length", std::to_string(file->size));
        // outgoing_response->putHeader("Content-Disposition", std::string("attachment; filename=\"" + file->filename + "\""));
        // outgoing_response->putHeader("Content-Type", "application/octet-stream");

        return outgoing_response;
    }

    ENDPOINT("POST", "/files/delete", files_delete,
             BODY_DTO(oatpp::Object<AuthFileInfoDto>, auth_file_info_dto))
    {
        OATPP_ASSERT_HTTP(auth_file_info_dto->session, Status::CODE_500, "Login first");
        OATPP_ASSERT_HTTP(penefiles_service.authenticate(auth_file_info_dto->session), Status::CODE_500, "Not logged in.");

        return createDtoResponse(Status::CODE_200, penefiles_service.delete_file(auth_file_info_dto));
    }

    ENDPOINT("POST", "/files/update", files_update,
             BODY_DTO(oatpp::Object<AuthFileUpdateDto>, auth_file_update_dto))
    {
        OATPP_ASSERT_HTTP(auth_file_update_dto->session, Status::CODE_500, "Login first");
        OATPP_ASSERT_HTTP(penefiles_service.authenticate(auth_file_update_dto->session), Status::CODE_500, "Not logged in.");
        
        return createDtoResponse(Status::CODE_200, penefiles_service.update_file(auth_file_update_dto));
    }

    ENDPOINT("POST", "/files/upload", files_upload,
             REQUEST(std::shared_ptr<IncomingRequest>, request))
    {
        return createDtoResponse(Status::CODE_200, penefiles_service.upload_file(request));
    }

    ENDPOINT("POST", "/notes/create", notes_create,
             BODY_DTO(Object<AuthNoteUpdateDto>, auth_note_update_dto))
    {
        OATPP_ASSERT_HTTP(auth_note_update_dto->session, Status::CODE_500, "Login first");
        OATPP_ASSERT_HTTP(auth_note_update_dto->filename, Status::CODE_500, "No file name");
        OATPP_ASSERT_HTTP(auth_note_update_dto->content, Status::CODE_500, "No content");
        OATPP_ASSERT_HTTP(penefiles_service.authenticate(auth_note_update_dto->session), Status::CODE_500, "Not logged in.");
        
        return createDtoResponse(Status::CODE_200, penefiles_service.create_note(auth_note_update_dto));
    }

    ENDPOINT("POST", "/notes/update", notes_update,
             BODY_DTO(Object<AuthNoteUpdateDto>, auth_note_update_dto))
    {
        OATPP_ASSERT_HTTP(auth_note_update_dto->session, Status::CODE_500, "Login first");
        OATPP_ASSERT_HTTP(auth_note_update_dto->filename, Status::CODE_500, "No file name");
        OATPP_ASSERT_HTTP(auth_note_update_dto->content, Status::CODE_500, "No content");
        OATPP_ASSERT_HTTP(penefiles_service.authenticate(auth_note_update_dto->session), Status::CODE_500, "Not logged in.");

        return createDtoResponse(Status::CODE_200, penefiles_service.update_note(auth_note_update_dto));
    }
};

#include OATPP_CODEGEN_END(ApiController) //<-- End Codegen

#endif // PENEFILES_PENEFILESCONTROLLER_HPP
