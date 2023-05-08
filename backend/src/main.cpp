#include <iostream>
#include <csignal>
#include <thread>
#include <oatpp/network/Server.hpp>
#include "AppComponent.hpp"
#include "controllers/PenefilesController.hpp"

std::unique_ptr<oatpp::network::Server> server;

void run()
{
    AppComponent components;

    OATPP_COMPONENT(std::shared_ptr<oatpp::web::server::HttpRouter>, router);
    router->addController(std::make_shared<PenefilesController>());

    OATPP_COMPONENT(std::shared_ptr<oatpp::network::ConnectionHandler>, connection_handler);
    OATPP_COMPONENT(std::shared_ptr<oatpp::network::ServerConnectionProvider>, connection_provider);

    server = std::make_unique<oatpp::network::Server>(connection_provider, connection_handler);

    OATPP_LOGI("PENEfiles", "Server running on port %s", connection_provider->getProperty("port").getData());

    server->run();
}

void signaled(int signal) 
{
    if (server)
    {
        server->stop();
        server.reset(nullptr);
    }
}

int main() 
{
    std::cout << "PENEfiles will start running soon." << std::endl;
    oatpp::base::Environment::init();

    std::thread main_thread([]() {
        run();
    });

    std::signal(SIGINT, signaled);
    main_thread.join();

    std::cout << std::endl << "Environment:" << std::endl;
    std::cout << "objectsCount = " << oatpp::base::Environment::getObjectsCount() << std::endl;
    std::cout << "objectsCreated = " << oatpp::base::Environment::getObjectsCreated() << std::endl << std::endl;
  
    oatpp::base::Environment::destroy();

    return 0;
}
